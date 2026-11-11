import assert from 'node:assert/strict';
import {test,afterEach,mock} from 'node:test';
import {oauthStart,oauthCallback,oauthAction} from '../src/lib/oauth.ts';
const before={...process.env};
afterEach(()=>{mock.restoreAll();for(const key of ['OAUTH_ENABLED','OAUTH_BRIDGE_SECRET','FRONTEND_URL','AUTH_ALLOWED_ORIGINS','STRAPI_API_URL','NODE_ENV'])if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];});
function setup(){process.env.OAUTH_ENABLED='true';process.env.OAUTH_BRIDGE_SECRET='a'.repeat(64);process.env.FRONTEND_URL='https://themesphone.ru';process.env.AUTH_ALLOWED_ORIGINS='https://themesphone.ru,https://themesphone.com';process.env.STRAPI_API_URL='http://cms:1337';process.env.NODE_ENV='production';}
test('start checks Origin, sends linking token server-side and redirects without exposing bridge key',async()=>{
  setup();
  const fetch=mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://cms:1337/api/oauth/bridge');assert.equal(options.headers['x-oauth-bridge'],'a'.repeat(64));
    const data=JSON.parse(options.body);assert.equal(data.mode,'link');assert.equal(data.token,'session-token');
    return Response.json({url:'https://accounts.google.com/o/oauth2/v2/auth?state=test',browser:'b'.repeat(43)});
  });
  const req=new Request('http://internal/api/connect/google',{method:'POST',headers:{Origin:'https://themesphone.ru',Cookie:'token=session-token'},body:'mode=link'});
  const res=await oauthStart(req,'google');assert.equal(res.status,303);assert.match(res.headers.get('location'),/^https:\/\/accounts.google.com/);assert.match(res.headers.get('set-cookie'),/HttpOnly; SameSite=Lax.*Secure/);assert.doesNotMatch(res.headers.get('location'),/session-token|a{64}/);
  assert.equal((await oauthStart(new Request('https://themesphone.ru/api/connect/google',{method:'POST',headers:{Origin:'https://evil.example'},body:''}),'google')).status,403);
  assert.equal(fetch.mock.callCount(),1);
});
test('callback accepts only code flow bound to a browser; legacy access_token and duplicates do not reach CMS',async()=>{
  setup();const fetch=mock.method(globalThis,'fetch',()=>{throw Error('Unexpected request');});
  for(const query of ['access_token=abc','state='+ 's'.repeat(43)+'&state=duplicate&code=x','state='+ 's'.repeat(43)+'&code=x&error=cancelled']) {
    const res=await oauthCallback(new Request('https://themesphone.ru/api/auth/google/callback?'+query,{headers:{Cookie:'oauth_google='+ 'b'.repeat(43)}}),'google');
    assert.match(res.headers.get('location'),/invalid_flow/);
  }
  assert.equal(fetch.mock.callCount(),0);
});
test('callback supports the second HTTPS domain behind Caddy and stores only session cookie',async()=>{
  setup();
  mock.method(globalThis,'fetch',async(_url,options)=>{assert.equal(JSON.parse(options.body).origin,'https://themesphone.com');return Response.json({jwt:'abc.def.ghi'});});
  const req=new Request('http://internal:3000/api/auth/telegram/callback?state='+ 's'.repeat(43)+'&code=single-code',{headers:{Host:'themesphone.com','X-Forwarded-Host':'themesphone.com',Cookie:'oauth_telegram='+ 'b'.repeat(43)}});
  const res=await oauthCallback(req,'telegram');
  assert.equal(res.status,303);assert.equal(res.headers.get('location'),'https://themesphone.com/account');assert.match(res.headers.get('set-cookie'),/token=abc.def.ghi; Path=\/; HttpOnly; SameSite=Lax.*Secure/);assert.doesNotMatch(res.headers.get('location'),/code|token/);
});
test('unknown forwarded hosts never become callback redirects',async()=>{
  setup();const fetch=mock.method(globalThis,'fetch',()=>{throw Error('Unexpected request');});
  assert.equal((await oauthCallback(new Request('http://internal/callback',{headers:{Host:'evil.example'}}),'google')).status,400);assert.equal(fetch.mock.callCount(),0);
});
test('pending identity uses HttpOnly ticket and onboarding whitelists input',async()=>{
  setup();mock.method(globalThis,'fetch',async(_url,options)=>{
    const input=JSON.parse(options.body);assert.equal(input.pending,'p'.repeat(43));assert.equal(input.userId,undefined);assert.equal(input.confirmed,undefined);
    return Response.json({registered:true,mailSent:true});
  });
  const res=await oauthAction(new Request('https://themesphone.ru/api/auth/oauth/register',{method:'POST',headers:{Origin:'https://themesphone.ru',Cookie:'oauth_pending='+ 'p'.repeat(43)},body:JSON.stringify({email:'user@example.test',userId:123,confirmed:true})}),'register');
  assert.equal(res.status,200);assert.match(res.headers.get('set-cookie'),/oauth_pending=;.*Max-Age=0/);
});
