// Real local PostgreSQL and BFF bridge; provider identities are fixtures.
// All created records are tracked and removed. Production and real SMTP refused.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dotenv=require('../backend/node_modules/dotenv');
const {createStrapi}=require('../backend/node_modules/@strapi/strapi');
const {createOAuthService}=require('../backend/src/lib/oauth-service');
const real=require('../backend/src/lib/oauth-providers');
let phase='setup';
async function main(){
  const env=dotenv.parse(fs.readFileSync(path.join(root,'.local/auth/backend.env')));
  const runtime=JSON.parse(fs.readFileSync(path.join(root,'.local/auth/runtime.json')));
  if(env.DATABASE_NAME!=='themesphone_auth_dev'||env.DATABASE_HOST!=='127.0.0.1'||env.DATABASE_PORT!=='5434'||env.SMTP_HOST!=='127.0.0.1'||env.SMTP_PORT!=='1026'||runtime.mailTransport!=='mailpit')throw Error('Refusing a non-isolated environment');
  const bridge=dotenv.parse(fs.readFileSync(path.join(root,'.local/oauth/frontend.env'))),origin='http://127.0.0.1:3100';
  Object.assign(process.env,env,{ENV_PATH:path.join(root,'.local/auth/backend.env'),AUTH_CONFIGURE_EMAIL:'false',DOCUMENTATION_ENABLED:'false',OAUTH_ENABLED:'true',OAUTH_ALLOWED_ORIGINS:origin,OAUTH_BRIDGE_SECRET:bridge.OAUTH_BRIDGE_SECRET,FRONTEND_URL:origin,STRAPI_API_URL:'http://127.0.0.1:1339'});
  delete process.env.DATABASE_URL;delete process.env.SMTP_USER;delete process.env.SMTP_PASS;
  process.chdir(path.join(root,'backend'));
  const strapi=createStrapi({appDir:process.cwd(),distDir:process.cwd()});await strapi.load();
  const U='plugin::users-permissions.user',I='api::oauth-identity.oauth-identity',F='api::oauth-flow.oauth-flow',O='api::order.order';
  const q=uid=>strapi.db.query(uid),jwt=strapi.plugin('users-permissions').service('jwt'),users=[],orderIds=[],flowKeys=new Set(),profiles={};
  const tag='mergecheck-'+Date.now()+'-'+real.random().slice(0,8);let sequence=0;
  const api={...real,configured:provider=>real.PROVIDERS.includes(provider),authorization:async(_provider,flow)=>'https://accounts.google.com/auth?state='+flow.state,exchange:async provider=>({subject:profiles[provider],email:''})};
  const service=createOAuthService(strapi,api);
  const {oauthAction}=await import('../frontend/src/lib/oauth.ts');
  const {me,login,resetPassword}=await import('../frontend/src/lib/email-auth.ts');
  const role=await q('plugin::users-permissions.role').findOne({where:{type:'authenticated'}});
  const request=(data,token,ticket)=>new Request(origin+'/api/account/connections',{method:'POST',headers:{Origin:origin,Cookie:'token='+token+'; oauth_merge='+(ticket || '')},body:JSON.stringify(data)});
  async function flow(provider,extra={}){const result=await service.start({origin,provider,...extra}),state=new URL(result.url).searchParams.get('state');flowKeys.add(real.digest(state));return {origin,provider,state,browser:result.browser,code:'fixture-code',...extra};}
  async function oauth(provider){profiles[provider]=tag+'-'+(++sequence);const session=await service.finish(await flow(provider));const user=await q(U).findOne({where:{id:(await jwt.verify(session.jwt)).id}});users.push(user.id);return {user,token:session.jwt,subject:profiles[provider]};}
  async function email(){const password=real.random(),address=tag+'-'+(++sequence)+'@example.test';const user=await strapi.plugin('users-permissions').service('user').add({username:address,email:address,password,confirmed:true,blocked:false,provider:'local',role:role.id});users.push(user.id);return {user,password,token:jwt.issue({id:user.id})};}
  async function proposal(current,other,provider){profiles[provider]=other.subject;const result=await service.finish(await flow(provider,{mode:'link',token:current.token}));assert.ok(/^[A-Za-z0-9_-]{43}$/.test(result.mergePending));assert.equal(result.jwt,undefined);flowKeys.add(real.digest(result.mergePending));return {origin,token:current.token,merge:result.mergePending};}
  async function order(owner,amount,paid,extra={}){const row=await q(O).create({data:{amount,paid,users_permissions_user:owner,...extra}});orderIds.push(row.id);return row;}
  const ordersFor=id=>q(O).findMany({where:{users_permissions_user:{id}},orderBy:{id:'asc'}});
  const expectCode=(promise,code)=>assert.rejects(promise,error=>error.code===code);
  try {
    phase='cancel, consent and session binding';
    const a=await oauth('google'),b=await email(),stranger=await email();
    await q(U).update({where:{id:a.user.id},data:{firstname:'Original',lastname:'Preserved surname'}});
    await q(U).update({where:{id:b.user.id},data:{firstname:'Keep current'}});
    const originalPassword=(await q(U).findOne({where:{id:b.user.id}})).password;
    const staleReset=require('node:crypto').randomBytes(64).toString('hex');
    for(const id of [a.user.id,b.user.id])await q(U).update({where:{id},data:{resetPasswordToken:id===b.user.id?staleReset:require('node:crypto').randomBytes(64).toString('hex'),resetPasswordExpiresAt:new Date(Date.now()+60000)}});
    const aOrder=await order(a.user.id,19900,true),draft=await order(a.user.id,29900,false,{documentId:real.random()}),published=await order(a.user.id,29900,false,{documentId:draft.documentId,publishedAt:new Date()});
    const bOrder=await order(b.user.id,9900,true),unrelated=await order(stranger.user.id,7700,true);
    const countsBefore={users:await q(U).count(),orders:await q(O).count()};
    let pending=await proposal(b,a,'google');
    await expectCode(service.mergeConfirm({...pending,confirm:false,password:b.password}),'merge_consent_required');
    await expectCode(service.mergePreview({...pending,token:stranger.token}),'invalid_merge');
    await expectCode(service.mergePreview({...pending,token:jwt.issue({id:b.user.id,fixtureNonce:'another-session'})}),'invalid_merge');
    await expectCode(service.mergePreview({...pending,origin:'http://evil.example'}),'invalid_merge');
    await service.mergeCancel(pending);await expectCode(service.mergeConfirm({...pending,confirm:true,password:b.password}),'invalid_merge');
    assert.equal((await ordersFor(a.user.id)).length,3);

    phase='expired and changed proposals';pending=await proposal(b,a,'google');
    const row=await q(F).findOne({where:{key:real.digest(pending.merge)}});
    await q(F).update({where:{id:row.id},data:{expiresAt:new Date(Date.now()-1000)}});
    await expectCode(service.mergePreview(pending),'invalid_merge');
    pending=await proposal(b,a,'google');
    profiles.yandex=tag+'-extra';await service.finish(await flow('yandex',{mode:'link',token:a.token}));
    await expectCode(service.mergePreview(pending),'merge_changed');

    phase='BFF preview, password failures and concurrent confirmation';pending=await proposal(b,a,'google');
    let response=await oauthAction(new Request(origin+'/api/account/connections?view=merge',{headers:{Cookie:'token='+b.token+'; oauth_merge='+pending.merge}}),'connections');
    assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.primaryEmail,b.user.email);assert.equal(preview.requiresPassword,true);assert.equal(preview.orderCount,2);assert.equal(preview.primaryId,undefined);assert.equal(preview.tokenHash,undefined);
    for(let attempt=0;attempt<2;attempt++)await expectCode(service.mergeConfirm({...pending,confirm:true,password:'incorrect-password'}),'merge_invalid_password');
    assert.equal((await q(F).findOne({where:{key:real.digest(pending.merge)}})).payload.passwordAttempts,2);
    const confirmations=await Promise.allSettled([service.mergeConfirm({...pending,confirm:true,password:b.password,userId:stranger.user.id}),service.mergeConfirm({...pending,confirm:true,password:b.password})]);
    assert.equal(confirmations.filter(result=>result.status==='fulfilled').length,1);
    const merged=confirmations.find(result=>result.status==='fulfilled').value;
    assert.equal((await jwt.verify(merged.jwt)).id,b.user.id);
    assert.equal((await q(U).findOne({where:{id:b.user.id}})).password,originalPassword);
    const primary=await q(U).findOne({where:{id:b.user.id}}),archived=await q(U).findOne({where:{id:a.user.id}});
    assert.equal(primary.email,b.user.email);assert.equal(primary.firstname,'Keep current');assert.equal(primary.lastname,'Preserved surname');assert.equal(archived.firstname,'Original');assert.equal(archived.blocked,true);assert.equal(archived.mergedIntoUserId,b.user.id);
    assert.equal(primary.resetPasswordToken,null);assert.equal(archived.resetPasswordToken,null);
    const stalePassword=real.random();response=await resetPassword(new Request(origin+'/api/auth/reset-password',{method:'POST',headers:{Origin:origin},body:JSON.stringify({code:staleReset,password:stalePassword,passwordConfirmation:stalePassword})}));assert.equal(response.status,400);
    assert.equal((await ordersFor(b.user.id)).length,4);assert.equal((await ordersFor(a.user.id)).length,0);assert.equal((await ordersFor(stranger.user.id))[0].id,unrelated.id);
    assert.equal(await q(U).count(),countsBefore.users);assert.equal(await q(O).count(),countsBefore.orders);
    for(const saved of [aOrder,draft,published,bOrder,unrelated]){const latest=await q(O).findOne({where:{id:saved.id}});assert.equal(String(latest.amount),String(saved.amount));assert.equal(latest.paid,saved.paid);assert.equal(latest.documentId,saved.documentId);}
    assert.equal(await q(I).count({where:{user:b.user.id}}),2);assert.equal(await q(I).count({where:{user:a.user.id}}),0);
    await expectCode(service.connections({token:a.token}),'login_required');await expectCode(service.mergeConfirm({...pending,confirm:true,password:b.password}),'invalid_merge');
    response=await me(new Request(origin+'/api/me',{headers:{Cookie:'token='+a.token}}));assert.equal(response.status,401);
    response=await me(new Request(origin+'/api/me',{headers:{Cookie:'token='+merged.jwt}}));assert.equal(response.status,200);assert.equal((await response.json()).mergedIntoUserId,undefined);
    response=await login(new Request(origin+'/api/login',{method:'POST',headers:{Origin:origin},body:JSON.stringify({identifier:b.user.email,password:b.password})}));assert.equal(response.status,200);
    profiles.google=a.subject;assert.equal((await jwt.verify((await service.finish(await flow('google'))).jwt)).id,b.user.id);

    phase='passwordless proof and reversed primary account';
    const c=await oauth('telegram'),d=await email();
    profiles.google=tag+'-google-email';await service.finish(await flow('google',{mode:'link',token:d.token}));d.subject=profiles.google;
    pending=await proposal(c,d,'google');
    assert.equal((await service.mergePreview(pending)).primaryIsCurrent,false);
    await expectCode(service.mergeConfirm({...pending,confirm:true}),'merge_verification_required');
    profiles.telegram=tag+'-wrong';await expectCode(service.finish(await flow('telegram',{mode:'merge-verify',token:c.token,merge:pending.merge})),'merge_wrong_account');
    profiles.telegram=c.subject;assert.equal((await service.finish(await flow('telegram',{mode:'merge-verify',token:c.token,merge:pending.merge}))).mergeVerified,true);
    let proofRow=await q(F).findOne({where:{key:real.digest(pending.merge)}});
    await q(F).update({where:{id:proofRow.id},data:{payload:{...proofRow.payload,currentProof:{...proofRow.payload.currentProof,at:Date.now()-301000}}}});
    await expectCode(service.mergeConfirm({...pending,confirm:true}),'merge_verification_required');
    await service.finish(await flow('telegram',{mode:'merge-verify',token:c.token,merge:pending.merge}));
    response=await oauthAction(request({action:'merge-accounts',confirm:true,primaryId:stranger.user.id},c.token,pending.merge),'account');assert.equal(response.status,200);assert.deepEqual(await response.json(),{merged:true});
    const cookie=response.headers.get('set-cookie').match(/token=([^;]+)/)[1];assert.equal((await jwt.verify(decodeURIComponent(cookie))).id,d.user.id);
    assert.match(response.headers.get('set-cookie'),/oauth_merge=;/);assert.equal((await q(U).findOne({where:{id:c.user.id}})).blocked,true);assert.equal(await q(I).count({where:{user:d.user.id}}),2);

    phase='transaction rollback after an owned order has moved';
    const e=await oauth('google'),f=await email();const retained=await order(e.user.id,5500,true);pending=await proposal(f,e,'google');
    const originalQuery=strapi.db.query.bind(strapi.db);strapi.db.query=uid=>{const query=originalQuery(uid);return uid===I?{...query,update:async()=>{throw Error('Injected identity update failure');}}:query;};
    try {await assert.rejects(service.mergeConfirm({...pending,confirm:true,password:f.password}));}finally{strapi.db.query=originalQuery;}
    assert.equal((await ordersFor(e.user.id))[0].id,retained.id);assert.equal((await q(U).findOne({where:{id:e.user.id}})).blocked,false);assert.equal((await q(F).findOne({where:{key:real.digest(pending.merge)}})).consumedAt,null);assert.equal(await q(I).count({where:{user:e.user.id}}),1);
    await service.mergeConfirm({...pending,confirm:true,password:f.password});assert.equal((await ordersFor(f.user.id))[0].id,retained.id);

    phase='per-proposal password limit';
    const g=await oauth('google'),h=await email();pending=await proposal(h,g,'google');
    for(let attempt=0;attempt<5;attempt++)await expectCode(service.mergeConfirm({...pending,confirm:true,password:'incorrect-password'}),'merge_invalid_password');
    await expectCode(service.mergeConfirm({...pending,confirm:true,password:h.password}),'rate_limited');assert.equal((await q(U).findOne({where:{id:g.user.id}})).blocked,false);
    phase='session-wide limit cannot be bypassed with fresh merge tickets';
    const i=await oauth('google'),j=await email();
    for(let attempt=0;attempt<5;attempt++){
      pending=await proposal(j,i,'google');
      response=await oauthAction(request({action:'merge-accounts',confirm:true,password:'incorrect-password'},j.token,pending.merge),'account');assert.equal(response.status,401);
    }
    pending=await proposal(j,i,'google');response=await oauthAction(request({action:'merge-accounts',confirm:true,password:j.password},j.token,pending.merge),'account');assert.equal(response.status,429);assert.equal((await q(U).findOne({where:{id:i.user.id}})).blocked,false);
    phase='unknown owned resources fail closed';
    const model=strapi.contentTypes['api::wallpaper.wallpaper'];
    model.attributes.mergeFixtureOwner={type:'relation',target:U};
    try {assert.ok(strapi.contentTypes['api::wallpaper.wallpaper'].attributes.mergeFixtureOwner);await expectCode(service.mergePreview(pending),'merge_data_conflict');}finally{delete model.attributes.mergeFixtureOwner;}
    console.log('PASS: real PostgreSQL merge; consent, cancellation, expiry, session/origin binding, wrong identity/password and limits; one concurrent confirmation; primary credentials and all order versions preserved; old secondary session rejected; passwordless reauthentication and reverse primary; BFF cookie replacement; full rollback after injected mid-merge failure. No external providers or real SMTP.');
  } finally {
    if(orderIds.length)await q(O).deleteMany({where:{id:{$in:orderIds}}});
    if(users.length){await q(I).deleteMany({where:{user:{id:{$in:users}}}});await q(U).deleteMany({where:{id:{$in:users}}});}
    if(flowKeys.size)await q(F).deleteMany({where:{key:{$in:[...flowKeys]}}});
    await strapi.destroy();
  }
}
main().catch(error=>{fs.mkdirSync(path.join(root,'.local/merge'),{recursive:true});fs.writeFileSync(path.join(root,'.local/merge/integration-error.txt'),String(error.stack || error));console.error('Merge integration failed at '+phase+'; diagnostic details remain in ignored .local/merge/integration-error.txt.');process.exitCode=1;});
