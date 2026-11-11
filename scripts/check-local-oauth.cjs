// Real isolated PostgreSQL/Strapi policies with fake provider identities; no real OAuth accounts.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dotenv=require('../backend/node_modules/dotenv');
const {createStrapi}=require('../backend/node_modules/@strapi/strapi');
const {createOAuthService}=require('../backend/src/lib/oauth-service');
const real=require('../backend/src/lib/oauth-providers');
async function main(){
  const env=dotenv.parse(fs.readFileSync(path.join(root,'.local/auth/backend.env')));
  if(env.DATABASE_NAME!=='themesphone_auth_dev' || env.DATABASE_HOST!=='127.0.0.1' || env.DATABASE_PORT!=='5434') throw Error('Refusing non-isolated database');
  const runtime=JSON.parse(fs.readFileSync(path.join(root,'.local/auth/runtime.json')));
  if(runtime.mailTransport!=='mailpit') throw Error('Real SMTP is forbidden for this test');
  Object.assign(process.env,env,{ENV_PATH:path.join(root,'.local/auth/backend.env'),AUTH_CONFIGURE_EMAIL:'false',DOCUMENTATION_ENABLED:'false',OAUTH_ENABLED:'false'});
  delete process.env.DATABASE_URL;delete process.env.SMTP_USER;delete process.env.SMTP_PASS;
  process.chdir(path.join(root,'backend'));
  const strapi=createStrapi({appDir:process.cwd(),distDir:process.cwd()});
  await strapi.load();
  const origin='http://127.0.0.1:3100';
  let subject='new-'+Date.now();
  const api={...real,configured:provider=>real.PROVIDERS.includes(provider),authorization:async(provider,flow)=>'https://accounts.google.com/auth?state='+flow.state,exchange:async()=>({subject,email:'suggested@example.test'})};
  const service=createOAuthService(strapi,api);
  const q=uid=>strapi.db.query(uid);
  const U='plugin::users-permissions.user',F='api::oauth-flow.oauth-flow',I='api::oauth-identity.oauth-identity';
  const jwt=strapi.plugin('users-permissions').service('jwt');
  async function start(provider='google',extra={}){const result=await service.start({provider,origin,...extra});return {provider,origin,browser:result.browser,state:new URL(result.url).searchParams.get('state'),code:'test-code',...extra};}
  try {
    const first=await start();
    await assert.rejects(service.finish({...first,browser:'b'.repeat(43)}),error=>error.code==='invalid_flow');
    const concurrent=await Promise.allSettled([service.finish(first),service.finish(first)]);
    assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1,'Only one callback consumes a flow');
    const result=concurrent.find(result=>result.status==='fulfilled').value;
    assert.ok(result.pending);assert.equal(result.jwt,undefined);
    const pending=await service.pending({pending:result.pending,origin});assert.equal(pending.provider,'google');
    await assert.rejects(service.pending({pending:result.pending,origin:'https://themesphone.com'}),error=>error.code==='invalid_flow');
    const email='oauth-'+Date.now()+'@example.test';
    const registration=await Promise.allSettled([service.register({pending:result.pending,origin,email}),service.register({pending:result.pending,origin,email})]);
    assert.equal(registration.filter(result=>result.status==='fulfilled').length,1,'Only one pending registration succeeds');
    assert.equal(registration.find(result=>result.status==='fulfilled').value.mailSent,true);
    const user=await q(U).findOne({where:{email}});assert.equal(user.confirmed,false);assert.ok(!user.password);
    await assert.rejects(service.finish(await start()),error=>error.code==='confirm_email');
    const captured=await fetch('http://127.0.0.1:8026/api/v1/messages').then(res=>res.json());
    assert.equal(captured.messages.filter(message=>message.To.some(to=>to.Address===email)).length,1);
    const {confirmEmail,forgotPassword,resetPassword,login,register}=await import('../frontend/src/lib/email-auth.ts');
    process.env.STRAPI_API_URL='http://127.0.0.1:1339';process.env.FRONTEND_URL=origin;
    const request=(route,data)=>new Request(origin+'/api/'+route,{method:'POST',headers:{Origin:origin},body:JSON.stringify(data)});
    assert.equal((await confirmEmail(new Request(origin+'/api/auth/email-confirmation',{method:'POST',headers:{Origin:origin},body:JSON.stringify({confirmation:user.confirmationToken})}))).status,200);
    const session=await service.finish(await start());assert.equal((await jwt.verify(session.jwt)).id,user.id);
    await assert.rejects(service.unlink({origin,token:session.jwt,provider:'google'}),error=>error.code==='last_login_method');
    // Same email with a different external identity never attaches automatically.
    subject='other-'+Date.now();
    const other=await service.finish(await start());
    await assert.rejects(service.register({origin,pending:other.pending,email}),error=>error.code==='account_exists');
    assert.equal(await q(I).count({where:{user:user.id}}),1);
    const linked=await service.finish(await start('telegram',{mode:'link',token:session.jwt}));assert.equal(linked.linked,true);
    assert.equal(await q(I).count({where:{user:user.id}}),2);
    const connections=await service.connections({token:session.jwt});assert.equal(connections.hasPassword,false);assert.equal(connections.connections.filter(item=>item.linked).length,2);
    const unlink=await Promise.allSettled([service.unlink({token:session.jwt,provider:'google'}),service.unlink({token:session.jwt,provider:'telegram'})]);
    assert.equal(unlink.filter(result=>result.status==='fulfilled').length,1,'Concurrent unlink preserves a login method');
    assert.equal(await q(I).count({where:{user:user.id}}),1);
    const remaining=await q(I).findOne({where:{user:user.id}});
    subject=remaining.subject;
    const role=await q('plugin::users-permissions.role').findOne({where:{type:'authenticated'}});
    const second=await strapi.plugin('users-permissions').service('user').add({email:'oauth-other-'+Date.now()+'@example.test',username:'oauth-other-'+Date.now(),provider:'local',confirmed:true,blocked:false,role:role.id});
    const secondToken=jwt.issue({id:second.id});
    await assert.rejects(service.finish(await start(remaining.provider,{mode:'link',token:secondToken})),error=>error.code==='identity_in_use');
    assert.equal(await q(I).count({where:{user:second.id}}),0,'Another user cannot steal an existing identity');
    // Email sign-up in the HTTP server and onboarding in this process share a database lock.
    subject='race-'+Date.now();
    const racingPending=await service.finish(await start());
    const racingEmail='oauth-race-'+Date.now()+'@example.test';
    const racingPassword=real.random();
    const races=await Promise.allSettled([
      service.register({origin,pending:racingPending.pending,email:racingEmail}),
      register(request('register',{email:racingEmail,password:racingPassword})).then(response=>{if(response.status!==200)throw Error('Sign-up rejected');return response;}),
    ]);
    assert.equal(races.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(await q(U).count({where:{email:racingEmail}}),1,'Email and OAuth registration cannot create duplicates');
    assert.equal((await forgotPassword(request('auth/forgot-password',{email}))).status,200);
    const resetUser=await q(U).findOne({where:{id:user.id}});
    const password=real.random();
    assert.equal((await resetPassword(request('auth/reset-password',{code:resetUser.resetPasswordToken,password,passwordConfirmation:password}))).status,200);
    assert.equal((await login(request('login',{identifier:email,password}))).status,200);
    assert.equal((await service.connections({token:session.jwt})).hasPassword,true);
    await service.unlink({token:session.jwt,provider:remaining.provider});
    assert.equal(await q(I).count({where:{user:user.id}}),0,'Password remains a login method after unlink');
    const flow=await start('google',{mode:'link',token:session.jwt});
    await assert.rejects(service.finish({...flow,token:'invalid-token'}),error=>error.code==='login_required');
    const expired=await start();
    await q(F).update({where:{key:real.digest(expired.state)},data:{expiresAt:new Date(Date.now()-1000)}});
    await assert.rejects(service.finish(expired),error=>error.code==='invalid_flow');
    // A real blocked row also cannot use an already valid OAuth identity/session.
    await q(U).update({where:{id:user.id},data:{blocked:true}});
    await assert.rejects(service.connections({token:session.jwt}),error=>error.code==='login_required');
    console.log('PASS: real DB single-use callback and concurrent registration; email confirmation before login; existing email never merges; another account cannot steal identity; explicit linking; concurrent unlink keeps last method; concurrent email/OAuth sign-up is unique; OAuth user can set first password through recovery; changed session, expired flow and blocked user rejected. Mailpit only.');
  } finally {await strapi.destroy();}
}
main().catch(error=>{fs.writeFileSync(path.join(root,'.local/oauth/integration-error.txt'),String(error.stack || error));console.error('OAuth integration check failed; details saved only in ignored .local/oauth/integration-error.txt.');process.exitCode=1;});
