'use strict';
// Integration checks are confined to the existing isolated local auth database.
// No S3, SMTP, OAuth provider or YooKassa requests are made.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'backend');
const requireBackend=createRequire(path.join(backend,'package.json'));
let phase='isolated environment';
async function main(){
  const envPath=path.join(root,'.local/auth/backend.env');
  const env=requireBackend('dotenv').parse(fs.readFileSync(envPath));
  if(env.DATABASE_NAME!=='themesphone_auth_dev'||env.DATABASE_HOST!=='127.0.0.1'||env.DATABASE_PORT!=='5434'||env.NODE_ENV!=='development')throw Error('Refusing non-isolated database');
  Object.assign(process.env,env,{ENV_PATH:envPath,HOST:'127.0.0.1',PORT:'1342',DOCUMENTATION_ENABLED:'false',
    AUTH_CONFIGURE_EMAIL:'false',OAUTH_ENABLED:'false',ORDERS_ENABLED:'true',PAYMENTS_ENABLED:'false',
    SMTP_HOST:'127.0.0.1',SMTP_PORT:'1026',SMTP_SECURE:'false',STRAPI_TELEMETRY_DISABLED:'true',DATABASE_POOL_MIN:'0',DATABASE_POOL_MAX:'5'});
  for(const key of ['DATABASE_URL','SMTP_USER','SMTP_PASS'])delete process.env[key];
  phase='database snapshot';
  const db=['compose','--env-file',envPath,'-f',path.join(root,'compose.auth.yaml'),'exec','-T','db'];
  const dump=spawnSync('docker',[...db,'sh','-c','exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],{maxBuffer:64*1024*1024,windowsHide:true});
  if(dump.status!==0||!dump.stdout?.length||spawnSync('docker',[...db,'pg_restore','--list'],{input:dump.stdout,maxBuffer:64*1024*1024,windowsHide:true}).status!==0)throw Error('Snapshot failed');
  const backups=path.join(root,'.local/backups/order-stage');fs.mkdirSync(backups,{recursive:true});
  fs.writeFileSync(path.join(backups,new Date().toISOString().replace(/[:.]/g,'-')+'.dump'),dump.stdout,{flag:'wx',mode:0o600});
  console.log('Validated isolated database snapshot.');

  process.chdir(backend);
  const app=requireBackend('@strapi/strapi').createStrapi({appDir:backend,distDir:backend});
  const {ORDER,createOrders}=require('../backend/src/lib/shop-orders');
  const {FILE,WALLPAPER}=require('../backend/src/lib/wallpaper-files');
  const USER='plugin::users-permissions.user',IDENTITY='api::oauth-identity.oauth-identity',FLOW='api::oauth-flow.oauth-flow';
  const users=[],docs=[],files=[],flows=[],identities=[];
  const tag='order-check-'+crypto.randomBytes(6).toString('hex');
  let loaded=false;
  try{
    phase='Strapi startup';await app.load();loaded=true;await app.start();
    const role=await app.db.query('plugin::users-permissions.role').findOne({where:{type:'authenticated'}});
    async function user(suffix,email=true){
      phase='creating local fixture user '+suffix;
      const item=await app.plugin('users-permissions').service('user').add({username:tag+suffix,email:email?tag+suffix+'@example.test':null,...(email?{password:'local-test-password-123'}:{}),provider:'local',confirmed:true,blocked:false,role:role.id});
      users.push(item.id);return item;
    }
    const owner=await user('-owner'),other=await user('-other'),oauth=await user('-oauth',false);
    const token=item=>app.plugin('users-permissions').service('jwt').issue({id:item.id});
    const tokens=new Map(users.map(id=>[id,token({id})]));
    async function product(suffix,price='299',isFree=false,published=true,ready=true){
      const item=await app.documents(WALLPAPER).create({status:published?'published':'draft',data:{title:tag+suffix,price,isFree}});docs.push(item.documentId);
      if(ready){
        // Orders only read metadata. There is deliberately no cloud/local file.
        const file=await app.db.query(FILE).create({data:{wallpaperDocumentId:item.documentId,storageKey:'fixture-not-downloadable.jpg',sha256:'0'.repeat(64),mime:'image/jpeg',bytes:'1024',width:100,height:200,ready:true}});
        files.push(file.id);
      }
      return item;
    }
    const paid=await product('-paid'),second=await product('-second','120'),free=await product('-free','0',true),draft=await product('-draft','299',false,false),missing=await product('-missing','299',false,true,false);
    const base='http://127.0.0.1:1342';
    async function http(method,route,data,userId=owner.id){
      const response=await fetch(base+'/api/'+route,{method,headers:{...(userId?{Authorization:'Bearer '+tokens.get(userId)}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
      const body=await response.json().catch(()=>null);return {status:response.status,body};
    }
    const input=(ids=[paid.documentId],checkoutKey=crypto.randomUUID())=>({items:ids,checkoutKey});
    phase='authenticated order creation';
    assert.ok([401,403].includes((await http('POST','shop-orders',input(),null)).status));
    const request=input([paid.documentId,second.documentId]);
    const first=await http('POST','shop-orders',request);assert.equal(first.status,200);assert.equal(first.body.totalKopecks,41900);assert.equal(first.body.state,'awaiting_payment');
    const reference=first.body.id;
    assert.equal(first.body.owner,undefined);assert.equal(first.body.items[0].originalFileId,undefined);
    const stored=await app.db.query(ORDER).findOne({where:{reference},populate:['owner']});assert.equal(stored.owner.id,owner.id);assert.equal(stored.items.length,2);assert.ok(stored.items.every(row=>row.originalFileId));
    phase='ownership and retired CRUD';
    for(const suffix of ['', '/cancel'])assert.equal((await http(suffix?'POST':'GET','shop-orders/'+reference+suffix,suffix?{}:undefined,other.id)).status,404);
    assert.equal((await http('GET','shop-orders/'+reference+'?populate=*')).status,400);
    assert.equal((await http('GET','orders')).status,404);
    assert.equal((await http('PUT','shop-orders/'+reference,{state:'paid'})).status,405);
    for(const key of ['amount','paid','owner','state','paymentId','currency'])assert.equal((await http('POST','shop-orders',{...input(),[key]:true})).status,400);
    for(const item of [free,draft,missing])assert.equal((await http('POST','shop-orders',input([item.documentId]))).status,409);
    phase='retry, concurrency and immutable totals';
    const repeated=await http('POST','shop-orders',request);assert.equal(repeated.body.id,reference);
    assert.equal((await http('POST','shop-orders',{...request,items:[paid.documentId]})).status,409);
    const parallel=input();const twins=await Promise.all([http('POST','shop-orders',parallel),http('POST','shop-orders',parallel)]);
    assert.ok(twins.every(row=>row.status===200));assert.equal(twins[0].body.id,twins[1].body.id);
    await app.documents(WALLPAPER).update({documentId:paid.documentId,data:{price:'399'}});await app.documents(WALLPAPER).publish({documentId:paid.documentId});
    assert.equal((await http('GET','shop-orders/'+reference)).body.totalKopecks,41900);
    const changed=await http('POST','shop-orders',input());assert.equal(changed.body.totalKopecks,39900);
    const cancelled=await http('POST','shop-orders/'+reference+'/cancel',{});assert.equal(cancelled.body.state,'cancelled');
    assert.equal((await http('POST','shop-orders/'+reference+'/cancel',{})).body.state,'cancelled');
    const otherList=await http('GET','shop-orders',undefined,other.id);assert.deepEqual(otherList.body,{orders:[],hasMore:false});
    phase='frontend session BFF over real HTTP';
    process.env.STRAPI_API_URL=base;
    const bff=await import(pathToFileURL(path.join(root,'frontend/src/lib/checkout.ts')).href);
    const bffInput=input(),bffReq=new Request('http://127.0.0.1:3100/api/checkout/start',{method:'POST',headers:{Origin:'http://127.0.0.1:3100',Cookie:'token='+tokens.get(owner.id)},body:JSON.stringify(bffInput)});
    const result=await bff.startCheckout(bffReq);assert.equal(result.status,200);assert.equal((await result.json()).order.totalKopecks,39900);
    assert.equal(bff.paymentUnavailable().status,503);
    phase='account merge transfers owned orders atomically';
    const oauthOrder=await createOrders(app).create(oauth.id,input());
    const identity=await app.db.query(IDENTITY).create({data:{key:tag+'-identity',provider:'google',subject:tag,user:oauth.id}});identities.push(identity.id);
    const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
    const api={digest,random:()=>crypto.randomBytes(32).toString('base64url'),configured:()=>true};
    const currentUser=async value=>{assert.equal(value,tokens.get(owner.id));return app.db.query(USER).findOne({where:{id:owner.id},populate:['role']});};
    const merge=require('../backend/src/lib/oauth-account-merge').createAccountMerge(app,api,currentUser);
    const context={origin:'https://themesphone.test',token:tokens.get(owner.id),provider:'google'};
    const pending=await app.db.transaction(async({trx})=>{await merge.lockUsers(trx,[owner.id,oauth.id]);return merge.begin(context,oauth.id,trx);});
    flows.push(digest(pending.mergePending));
    const proposal={...context,merge:pending.mergePending};assert.equal((await merge.preview(proposal)).orderCount,1);
    await merge.confirm({...proposal,confirm:true,password:'local-test-password-123'});
    assert.equal((await createOrders(app).findOne(owner.id,oauthOrder.id)).id,oauthOrder.id);
    await assert.rejects(createOrders(app).create(oauth.id,input()),error=>error.code==='login_required');
    assert.ok([401,403].includes((await http('GET','shop-orders/'+oauthOrder.id,undefined,oauth.id)).status));
    phase='disabled flag and paid downloads remain closed';
    process.env.ORDERS_ENABLED='false';assert.equal((await http('POST','shop-orders',input())).status,503);
    assert.equal((await http('GET','shop-orders/'+oauthOrder.id)).status,200);
    assert.equal((await http('GET','wallpaper-files/'+stored.items[0].originalFileId+'/download',undefined,null)).status,403);
    console.log('PASS: ownership, server totals, retries/concurrency, immutable snapshot, cancellation, retired CRUD, BFF, profile merge and disabled payments.');
  }finally{
    if(loaded){
      for(const key of flows)await app.db.query(FLOW).delete({where:{key}});
      for(const id of identities)await app.db.query(IDENTITY).delete({where:{id}});
      for(const id of users)await app.db.query(ORDER).deleteMany({where:{owner:{id}}});
      for(const id of files)await app.db.query(FILE).delete({where:{id}});
      for(const documentId of docs)await app.documents(WALLPAPER).delete({documentId});
      for(const id of users)await app.db.query(USER).delete({where:{id}});
      console.log('Local test fixtures removed.');
    }
    await app.destroy();
  }
}
main().catch(error=>{
  console.error('FAILED at',phase,':',error instanceof assert.AssertionError?error.message:'Local integration failed (no secrets logged).');
  if(!(error instanceof assert.AssertionError))console.error(error.name,(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,3).join('\n'));
  process.exitCode=1;
});
