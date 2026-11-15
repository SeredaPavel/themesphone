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
  const {PAYMENT,createPayments}=require('../backend/src/lib/shop-payments');
  const {PaymentError}=require('../backend/src/lib/yookassa');
  const {FILE,WALLPAPER}=require('../backend/src/lib/wallpaper-files');
  const USER='plugin::users-permissions.user',IDENTITY='api::oauth-identity.oauth-identity',FLOW='api::oauth-flow.oauth-flow';
  const users=[],docs=[],files=[],flows=[],identities=[],uploads=[];
  const scratch=fs.mkdtempSync(path.join(root,'.local/order-download-check-'));
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
    phase='idempotent payments and hostile notifications';
    const cfg={shopId:'123',origin:'http://127.0.0.1:3100',mode:'test'};
    const byKey=new Map(),byId=new Map();let loseResponse=true;
    const fake={checkShop:async()=>{},create:async(body,key)=>{
      let value=byKey.get(key);
      if(!value){value={id:crypto.randomUUID(),test:true,paid:false,status:'pending',recipient:{account_id:cfg.shopId},amount:body.amount,metadata:body.metadata,confirmation:{confirmation_url:'https://yoomoney.ru/api-pages/v2/payment-confirm/epl?orderId='+key}};byKey.set(key,value);byId.set(value.id,value);}
      if(loseResponse){loseResponse=false;throw new PaymentError('payment_provider_unavailable');}return structuredClone(value);
    },get:async id=>structuredClone(byId.get(id))};
    const checkout=createPayments(app,{config:cfg,api:fake});
    const paymentOrder=await createOrders(app).create(owner.id,input());
    await assert.rejects(checkout.start(other.id,paymentOrder.id),error=>error.code==='order_not_found');assert.equal(byKey.size,0);
    await assert.rejects(checkout.start(owner.id,paymentOrder.id),error=>error.code==='payment_provider_unavailable');
    await assert.rejects(createOrders(app).cancel(owner.id,paymentOrder.id),error=>error.code==='payment_in_progress');
    const [paymentA,paymentB]=await Promise.all([checkout.start(owner.id,paymentOrder.id),checkout.start(owner.id,paymentOrder.id)]);
    assert.equal(byKey.size,1);assert.equal(paymentA.payment.confirmationUrl,paymentB.payment.confirmationUrl);
    const provider=[...byId.values()][0];
    const notification={type:'notification',event:'payment.succeeded',object:{id:provider.id,status:'succeeded',paid:true}};
    await checkout.webhook(notification);
    assert.equal((await createOrders(app).findOne(owner.id,paymentOrder.id)).state,'awaiting_payment');
    provider.status='succeeded';provider.paid=true;
    const originalAmount=provider.amount;provider.amount={value:'0.01',currency:'RUB'};
    await assert.rejects(checkout.webhook(notification),error=>error.code==='payment_response_invalid');
    assert.equal((await createOrders(app).findOne(owner.id,paymentOrder.id)).state,'awaiting_payment');provider.amount=originalAmount;
    await Promise.all([checkout.webhook(notification),checkout.webhook(notification)]);
    assert.equal((await createOrders(app).findOne(owner.id,paymentOrder.id)).state,'test_paid');
    const success=await checkout.refresh(owner.id,paymentOrder.id);assert.equal(success.payment.test,true);assert.equal(success.order.state,'test_paid');
    const cancelOrder=await createOrders(app).create(owner.id,input());await checkout.start(owner.id,cancelOrder.id);
    const last=[...byId.values()].at(-1);last.status='canceled';
    await checkout.webhook({type:'notification',event:'payment.canceled',object:{id:last.id}});
    assert.equal((await createOrders(app).findOne(owner.id,cancelOrder.id)).state,'cancelled');
    assert.equal((await http('POST','payment-notifications/yookassa',notification,null)).status,403);
    assert.equal((await http('POST','shop-orders/'+paymentOrder.id+'/payment',{},other.id)).status,503);
    assert.equal((await http('GET','wallpaper-files/'+stored.items[0].originalFileId+'/download',undefined,owner.id)).status,403);
    phase='private test original and repeat downloads';
    const downloadable=await product('-download','299',false,true,false);
    const originalPath=path.join(scratch,'source.jpg'),directory=path.join(scratch,'private');
    const original=await requireBackend('sharp')({create:{width:64,height:128,channels:3,background:'#125c65'}}).jpeg().toBuffer();
    fs.writeFileSync(originalPath,original);
    const asset=await require('../backend/src/lib/wallpaper-files').importOriginal(app,downloadable.documentId,originalPath,{directory,publicDirectory:app.dirs.static.public,testOnly:true});
    const savedFile=await app.db.query(FILE).findOne({where:{documentId:asset.id}});files.push(savedFile.id);
    const savedWallpaper=await app.documents(WALLPAPER).findOne({documentId:downloadable.documentId,status:'published',populate:['image']});uploads.push(...savedWallpaper.image);
    process.env.WALLPAPER_ORIGINALS_DIR=directory;
    const downloadUser=await user('-download-oauth',false);tokens.set(downloadUser.id,token(downloadUser));
    process.env.ORDER_DOWNLOAD_DAYS='0';
    const downloadOrder=await createOrders(app).create(downloadUser.id,input([downloadable.documentId]));
    await checkout.start(downloadUser.id,downloadOrder.id);
    const paymentRaw=[...byId.values()].at(-1);paymentRaw.status='succeeded';paymentRaw.paid=true;
    await checkout.webhook({type:'notification',event:'payment.succeeded',object:{id:paymentRaw.id}});
    const granted=await createOrders(app).findOne(downloadUser.id,downloadOrder.id);assert.equal(granted.items[0].download.status,'available');
    const {download}=await import(pathToFileURL(path.join(root,'frontend/src/lib/download.ts')).href);
    function requestFile(userId,reference=downloadOrder.id){return new Request('http://127.0.0.1:3100/api/download?'+new URLSearchParams({file:asset.id,order:reference}),{headers:userId?{Cookie:'token='+tokens.get(userId)}:{}});}
    assert.equal((await download(requestFile(other.id))).status,403);
    assert.equal((await download(requestFile(null))).status,403);
    assert.equal((await download(requestFile(downloadUser.id,crypto.randomUUID()))).status,403);
    for(let repeat=0;repeat<2;repeat++){
      const response=await download(requestFile(downloadUser.id));assert.equal(response.status,200);assert.ok(Buffer.from(await response.arrayBuffer()).equals(original));
    }
    await app.documents(WALLPAPER).unpublish({documentId:downloadable.documentId});
    const afterUnpublish=await download(requestFile(downloadUser.id));assert.equal(afterUnpublish.status,200);await afterUnpublish.arrayBuffer();
    const extraIdentity=await app.db.query(IDENTITY).create({data:{key:tag+'-download-identity',provider:'telegram',subject:tag+'-download',user:downloadUser.id}});identities.push(extraIdentity.id);
    const secondContext={...context,provider:'telegram'};
    const secondPending=await app.db.transaction(async({trx})=>{await merge.lockUsers(trx,[owner.id,downloadUser.id]);return merge.begin(secondContext,downloadUser.id,trx);});flows.push(digest(secondPending.mergePending));
    await merge.confirm({...secondContext,merge:secondPending.mergePending,confirm:true,password:'local-test-password-123'});
    const afterMerge=await download(requestFile(owner.id));assert.equal(afterMerge.status,200);await afterMerge.arrayBuffer();
    assert.equal((await download(requestFile(downloadUser.id))).status,403);
    const row=await app.db.query(ORDER).findOne({where:{reference:downloadOrder.id}});
    await app.db.query(ORDER).update({where:{id:row.id},data:{downloadDays:1,paidAt:new Date(Date.now()-2*86400000)}});
    const expired=await download(requestFile(owner.id));assert.equal(expired.status,403);assert.equal((await expired.json()).error,'download_expired');
    assert.equal((await createOrders(app).findOne(owner.id,downloadOrder.id)).items[0].download.status,'download_expired');
    phase='disabled flag and paid downloads remain closed';
    process.env.ORDERS_ENABLED='false';assert.equal((await http('POST','shop-orders',input())).status,503);
    assert.equal((await http('GET','shop-orders/'+oauthOrder.id)).status,200);
    assert.equal((await http('GET','wallpaper-files/'+stored.items[0].originalFileId+'/download',undefined,null)).status,403);
    console.log('PASS: server orders, profile merge, concurrent payment retries, lost response, forged/replayed notifications, canonical validation, cancellation and no live entitlement from test payment.');
  }finally{
    if(loaded){
      for(const key of flows)await app.db.query(FLOW).delete({where:{key}});
      for(const id of identities)await app.db.query(IDENTITY).delete({where:{id}});
      for(const id of users){
        const owned=await app.db.query(ORDER).findMany({where:{owner:{id}},select:['reference']});
        if(owned.length)await app.db.query(PAYMENT).deleteMany({where:{orderReference:{$in:owned.map(row=>row.reference)}}});
        await app.db.query(ORDER).deleteMany({where:{owner:{id}}});
      }
      for(const id of files)await app.db.query(FILE).delete({where:{id}});
      for(const documentId of docs)await app.documents(WALLPAPER).delete({documentId});
      for(const media of uploads)await app.plugin('upload').service('upload').remove(media);
      for(const id of users)await app.db.query(USER).delete({where:{id}});
      console.log('Local test fixtures removed.');
    }
    await app.destroy();
    if(path.dirname(path.resolve(scratch))!==path.join(root,'.local')||!path.basename(scratch).startsWith('order-download-check-'))throw Error('Unsafe scratch cleanup');
    fs.rmSync(scratch,{recursive:true,force:true});
  }
}
main().catch(error=>{
  console.error('FAILED at',phase,':',error instanceof assert.AssertionError?error.message:'Local integration failed (no secrets logged).');
  if(!(error instanceof assert.AssertionError))console.error(error.name,(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,3).join('\n'));
  process.exitCode=1;
});
