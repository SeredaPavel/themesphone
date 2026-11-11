import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { login, register, confirmEmail, resendConfirmation, me, sessionCookie } from '../src/lib/email-auth.ts';
const before = { ...process.env };
afterEach(()=> { mock.restoreAll(); for(const key of ['STRAPI_API_URL','FRONTEND_URL','NODE_ENV','AUTH_ALLOWED_ORIGINS']) { if(before[key]===undefined) delete process.env[key]; else process.env[key]=before[key]; } });
const request = payload => new Request('https://shop.example/api/login',{method:'POST',headers:{Origin:'https://shop.example'},body:JSON.stringify(payload)});
test('login keeps JWT in a secure HttpOnly cookie and returns only public user fields',async()=> {
  process.env.STRAPI_API_URL='http://cms:1337'; process.env.NODE_ENV='production'; delete process.env.FRONTEND_URL;
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://cms:1337/api/auth/local'); assert.equal(options.redirect,'manual');
    return Response.json({jwt:'abc.def.ghi',user:{id:1,username:'user',email:'user@example.test',confirmed:true,resetPasswordToken:'private',role:{id:2}}});
  });
  const res=await login(request({identifier:'user@example.test',password:'password'}));
  assert.equal(res.status,200); assert.match(res.headers.get('set-cookie'),/HttpOnly; SameSite=Lax.*; Secure/);
  assert.deepEqual(Object.keys((await res.json()).user).sort(),['confirmed','email','id','username']);
});
test('untrusted origins and invalid registration input make no CMS request',async()=>{
  const fetch=mock.method(globalThis,'fetch',()=>{throw Error('Unexpected request');});
  assert.equal((await login(new Request('https://shop.example/api/login',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}))).status,403);
  assert.equal((await register(request({email:'invalid',password:'short'}))).status,400);
  assert.equal((await login(request(null))).status,400);
  assert.equal(fetch.mock.callCount(),0);
});
test('registration forwards only email username and password',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  mock.method(globalThis,'fetch',async(url,options)=>{assert.deepEqual(JSON.parse(options.body),{email:'user@example.test',username:'user@example.test',password:'long-password'}); return Response.json({user:{}});});
  assert.equal((await register(request({email:'USER@example.test',password:'long-password',role:1,confirmed:true}))).status,200);
});
test('confirmation uses stock Strapi GET without following its redirect',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  mock.method(globalThis,'fetch',async(url,options)=>{assert.match(url,/email-confirmation\?confirmation=a{40}$/);assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://shop.example/confirmation/submit'}});});
  assert.equal((await confirmEmail(request({confirmation:'a'.repeat(40)}))).status,200);
});
test('registration explains when Strapi created an account but failed to mail confirmation',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'Error sending confirmation email'}},{status:400}));
  const res=await register(request({email:'user@example.test',password:'long-password'}));
  assert.equal(res.status,503); assert.equal((await res.json()).canResend,true);
});
test('resend uses stock endpoint and explicit origin list supports the second domain',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337'; process.env.AUTH_ALLOWED_ORIGINS='https://themesphone.ru,https://themesphone.com';
  mock.method(globalThis,'fetch',async(url)=>{assert.equal(url,'http://cms:1337/api/auth/send-email-confirmation');return Response.json({error:{message:'Already confirmed'}},{status:400});});
  const req=new Request('http://internal:3000/api/auth/resend-confirmation',{method:'POST',headers:{Origin:'https://themesphone.com'},body:JSON.stringify({email:'user@example.test'})});
  const res=await resendConfirmation(req);
  assert.equal(res.status,200); assert.deepEqual(await res.json(),{success:true});
});
test('blocked or unconfirmed users never receive a session',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  mock.method(globalThis,'fetch',async()=>Response.json({jwt:'abc.def.ghi',user:{id:1,email:'user@example.test',confirmed:false}}));
  const res=await login(request({identifier:'user@example.test',password:'password'}));
  assert.equal(res.status,503);assert.equal(res.headers.get('set-cookie'),null);
});
test('local HTTP cookies work in a production preview; malformed cookie is rejected',async()=>{
  process.env.NODE_ENV='production';process.env.FRONTEND_URL='http://127.0.0.1:3100';
  assert.doesNotMatch(sessionCookie('abc.def.ghi'),/; Secure/);
  assert.equal((await me(new Request('http://127.0.0.1:3100/api/me',{headers:{Cookie:'token=%ZZ'}}))).status,401);
});
