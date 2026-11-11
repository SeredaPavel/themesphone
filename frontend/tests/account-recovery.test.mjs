import assert from 'node:assert/strict';
import {afterEach,test,mock} from 'node:test';
import {createRequire} from 'node:module';
import {forgotPassword,resetPassword,changePassword,updateProfile} from '../src/lib/email-auth.ts';
const require=createRequire(import.meta.url);
const {profileFields}=require('../../backend/src/lib/profile-fields.js');
const extendPlugin=require('../../backend/src/extensions/users-permissions/strapi-server.js');
const oldCms=process.env.STRAPI_API_URL;
afterEach(()=>{mock.restoreAll(); if(oldCms===undefined) delete process.env.STRAPI_API_URL; else process.env.STRAPI_API_URL=oldCms;});
const req=(data,cookie=true,origin='https://shop.example')=>new Request('https://shop.example/api/test',{method:'POST',headers:{Origin:origin,...(cookie?{Cookie:'token=abc.def.ghi'}:{})},body:JSON.stringify(data)});
test('forgot password normalizes email and does not disclose the existence of an account',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'http://cms:1337/api/auth/forgot-password');assert.deepEqual(JSON.parse(options.body),{email:'user@example.test'});return Response.json({ok:true});});
  assert.deepEqual(await (await forgotPassword(req({email:' USER@example.test '},false))).json(),{success:true});
});
test('mismatched reset passwords and forged origins never reach CMS',async()=>{
  const fetch=mock.method(globalThis,'fetch',()=>{throw Error('Must not call');});
  assert.equal((await resetPassword(req({code:'a'.repeat(128),password:'long-password',passwordConfirmation:'different'}))).status,400);
  assert.equal((await forgotPassword(req({email:'user@example.test'},false,'https://other.example'))).status,403);
  assert.equal(fetch.mock.callCount(),0);
});
test('successful reset discards upstream JWT and clears the browser session',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  mock.method(globalThis,'fetch',async()=>Response.json({jwt:'must-not-leak',user:{id:1}}));
  const res=await resetPassword(req({code:'a'.repeat(128),password:'long-password',passwordConfirmation:'long-password'}));
  assert.deepEqual(await res.json(),{success:true});assert.match(res.headers.get('set-cookie'),/HttpOnly.*Max-Age=0/);
});
test('password change requires a session and forwards current password to stock controller',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  assert.equal((await changePassword(req({},false))).status,401);
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer abc.def.ghi');assert.equal(JSON.parse(options.body).currentPassword,'old-password');
    return Response.json({jwt:'new.session.jwt',user:{id:1,username:'user',email:'user@example.test',confirmed:true}});
  });
  const res=await changePassword(req({currentPassword:'old-password',password:'new-password',passwordConfirmation:'new-password'}));
  assert.equal(res.status,200);assert.equal((await res.json()).jwt,undefined);assert.match(res.headers.get('set-cookie'),/^token=new.session.jwt;/);
});
test('profile rejects attempts to set user IDs roles passwords or email at both boundaries',async()=>{
  const fetch=mock.method(globalThis,'fetch',()=>{throw Error('Must not call');});
  for(const key of ['id','role','password','email','confirmed','blocked']) {
    assert.throws(()=>profileFields({firstname:'Имя',[key]:'forged'}));
    assert.equal((await updateProfile(req({firstname:'Имя',[key]:'forged'}))).status,400);
  }
  assert.equal(fetch.mock.callCount(),0);
});
test('profile accepts bounded personal fields and calls a route with no user-controlled ID',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  assert.deepEqual(profileFields({firstname:' Имя ',phone:'+7 (000) 123-45-67'}),{firstname:'Имя',phone:'+7 (000) 123-45-67'});
  assert.throws(()=>profileFields({firstname:'a'.repeat(81)}));assert.throws(()=>profileFields({lastname:'bad\nvalue'}));
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://cms:1337/api/account/profile');assert.equal(options.method,'PUT');assert.deepEqual(JSON.parse(options.body),{firstname:'Имя'});
    return Response.json({id:1,username:'user',email:'user@example.test',confirmed:true,firstname:'Имя',password:'private'});
  });
  const res=await updateProfile(req({firstname:' Имя '}));assert.equal(res.status,200);
  const data=await res.json();assert.equal(data.user.firstname,'Имя');assert.equal(data.user.password,undefined);
});
test('Strapi controller factory retains stock login and delegates email validation',async()=>{
  const callback=()=>{};
  let calls=0;
  const plugin=extendPlugin({controllers:{auth:()=>({callback,forgotPassword:async ctx=>{calls++;ctx.status=400;},resetPassword:async()=>{}})}});
  const controller=plugin.controllers.auth({});assert.equal(controller.callback,callback);
  await controller.forgotPassword({request:{body:{email:'bad'}},status:200});assert.equal(calls,1);
});
