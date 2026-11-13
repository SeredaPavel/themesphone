import assert from 'node:assert/strict';
import {test,afterEach,mock} from 'node:test';
import {oauthStart,oauthCallback,oauthAction} from '../src/lib/oauth.ts';
const before={...process.env};
afterEach(()=>{mock.restoreAll();for(const key of ['OAUTH_ENABLED','OAUTH_BRIDGE_SECRET','FRONTEND_URL','AUTH_ALLOWED_ORIGINS','STRAPI_API_URL','NODE_ENV'])if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];});
function setup(){Object.assign(process.env,{OAUTH_ENABLED:'true',OAUTH_BRIDGE_SECRET:'a'.repeat(64),FRONTEND_URL:'https://themesphone.ru',AUTH_ALLOWED_ORIGINS:'https://themesphone.ru,https://themesphone.com',STRAPI_API_URL:'http://cms:1337',NODE_ENV:'production'});}
const ticket='m'.repeat(43);
function callback(){return new Request('https://themesphone.ru/api/auth/google/callback?state='+ 's'.repeat(43)+'&code=fixture',{headers:{Cookie:'token=current-session; oauth_google='+ 'b'.repeat(43)+'; oauth_merge='+ticket}});}
function action(data,origin='https://themesphone.ru'){return new Request('https://themesphone.ru/api/account/connections',{method:'POST',headers:{Origin:origin,Cookie:'token=current-session; oauth_merge='+ticket},body:JSON.stringify(data)});}
test('conflicting provider callback sets only a private merge ticket and retains the current session',async()=>{
  setup();mock.method(globalThis,'fetch',async()=>Response.json({mergePending:ticket}));
  const response=await oauthCallback(callback(),'google');
  assert.equal(response.headers.get('location'),'https://themesphone.ru/auth/merge');
  const cookies=response.headers.get('set-cookie');assert.match(cookies,/oauth_merge=m{43};.*HttpOnly.*Secure/);assert.doesNotMatch(cookies,/(?:^|,\s*)token=/);assert.ok(!response.headers.get('location').includes(ticket));
});
test('verification start uses the session and ticket cookies rather than submitted identities',async()=>{
  setup();mock.method(globalThis,'fetch',async(_url,options)=>{const data=JSON.parse(options.body);assert.equal(data.mode,'merge-verify');assert.equal(data.merge,ticket);assert.equal(data.token,'current-session');assert.equal(data.userId,undefined);return Response.json({url:'https://accounts.google.com/auth',browser:'b'.repeat(43)});});
  const response=await oauthStart(new Request('https://themesphone.ru/api/connect/google',{method:'POST',headers:{Origin:'https://themesphone.ru',Cookie:'token=current-session; oauth_merge='+ticket},body:'mode=merge-verify&merge=forged&userId=999'}),'google');assert.equal(response.status,303);
});
test('successful merge replaces the HttpOnly session, clears the ticket and never returns a JWT in JSON',async()=>{
  setup();mock.method(globalThis,'fetch',async(_url,options)=>{const data=JSON.parse(options.body);assert.equal(data.action,'mergeConfirm');assert.equal(data.merge,ticket);assert.equal(data.token,'current-session');assert.equal(data.confirm,true);assert.equal(data.password,'correct-password');for(const key of ['userId','primaryId','otherId'])assert.equal(data[key],undefined);return Response.json({merged:true,jwt:'new.session.jwt'});});
  const response=await oauthAction(action({action:'merge-accounts',confirm:true,password:'correct-password',merge:'forged',token:'forged',userId:99,primaryId:99,otherId:99}),'account');
  assert.deepEqual(await response.json(),{merged:true});assert.match(response.headers.get('set-cookie'),/token=new.session.jwt;.*HttpOnly/);assert.match(response.headers.get('set-cookie'),/oauth_merge=;.*Max-Age=0/);
});
test('forged Origin cannot confirm or cancel a merge',async()=>{
  setup();const transport=mock.method(globalThis,'fetch',()=>{throw Error('Must not reach backend');});
  for(const name of ['merge-accounts','cancel-merge'])assert.equal((await oauthAction(action({action:name,confirm:true},'https://evil.example'),'account')).status,403);assert.equal(transport.mock.callCount(),0);
});
test('preview uses a cookie ticket; invalid proposals are cleared while wrong passwords can be retried',async()=>{
  setup();mock.method(globalThis,'fetch',async(_url,options)=>{const data=JSON.parse(options.body);assert.equal(data.action,'mergePreview');assert.equal(data.merge,ticket);return Response.json({error:'invalid_merge'},{status:400});});
  let response=await oauthAction(new Request('https://themesphone.ru/api/account/connections?view=merge&userId=999',{headers:{Cookie:'token=current-session; oauth_merge='+ticket}}),'connections');assert.equal(response.status,400);assert.match(response.headers.get('set-cookie'),/oauth_merge=;/);
  mock.restoreAll();mock.method(globalThis,'fetch',async()=>Response.json({error:'merge_invalid_password'},{status:401}));
  response=await oauthAction(action({action:'merge-accounts',confirm:true,password:'wrong'}),'account');assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);
});
test('only newly created OAuth accounts receive the optional welcome prompt',async()=>{
  setup();mock.method(globalThis,'fetch',async()=>Response.json({jwt:'new.session.jwt',created:true}));assert.equal((await oauthCallback(callback(),'google')).headers.get('location'),'https://themesphone.ru/account?welcome=google');
  mock.restoreAll();mock.method(globalThis,'fetch',async()=>Response.json({jwt:'old.session.jwt'}));assert.equal((await oauthCallback(callback(),'google')).headers.get('location'),'https://themesphone.ru/account');
});
