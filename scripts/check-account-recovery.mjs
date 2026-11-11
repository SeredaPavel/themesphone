import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as auth from '../frontend/src/lib/email-auth.ts';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const {Client}=require('pg');
const env=require('dotenv').parse(fs.readFileSync(new URL('../.local/auth/backend.env',import.meta.url)));
if(env.DATABASE_NAME!=='themesphone_auth_dev' || env.DATABASE_HOST!=='127.0.0.1' || env.DATABASE_PORT!=='5434') throw Error('Refusing to use a non-test database');
process.env.STRAPI_API_URL='http://127.0.0.1:1339';
process.env.FRONTEND_URL='http://127.0.0.1:3100';
const http=process.argv.includes('--http');
const runtime=JSON.parse(fs.readFileSync(new URL('../.local/auth/runtime.json',import.meta.url),'utf8'));
if(runtime.mailTransport!=='mailpit') throw new Error('Use Mailpit mode for automated recovery checks; real SMTP is refused.');
const paths={register:'register',login:'login',me:'me',confirmEmail:'auth/email-confirmation',forgotPassword:'auth/forgot-password',resetPassword:'auth/reset-password',changePassword:'auth/change-password',updateProfile:'account/profile'};
const call=(name,data,cookie)=>{
  const req=new Request(process.env.FRONTEND_URL+'/api/'+paths[name],{method:name==='me'?'GET':name==='updateProfile'?'PUT':'POST',headers:{Origin:process.env.FRONTEND_URL,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(name==='me'?{}:{body:JSON.stringify(data)})});
  return http?fetch(req):auth[name](req);
};
async function mail(email,subject) {
  const list=await fetch('http://127.0.0.1:8026/api/v1/messages').then(res=>res.json());
  const item=list.messages.find(item=>item.To.some(to=>to.Address===email) && item.Subject.includes(subject));
  assert.ok(item,'Expected local mail was captured');
  const message=await fetch('http://127.0.0.1:8026/api/v1/message/'+item.ID).then(res=>res.json());
  return message.HTML || message.Text;
}
async function account(suffix) {
  const email='recovery-'+Date.now()+'-'+suffix+'@example.test';
  const password=crypto.randomBytes(24).toString('base64url');
  assert.equal((await call('register',{email,password})).status,200);
  const confirmation=(await mail(email,'Подтверждение')).match(/confirmation=([a-f0-9]{40})/)?.[1];
  assert.ok(confirmation);assert.equal((await call('confirmEmail',{confirmation})).status,200);
  const login=await call('login',{identifier:email,password});assert.equal(login.status,200);
  return {email,password,cookie:login.headers.get('set-cookie').split(';')[0]};
}
const db=new Client({host:'127.0.0.1',port:5434,database:env.DATABASE_NAME,user:env.DATABASE_USERNAME,password:env.DATABASE_PASSWORD});
await db.connect();
try {
  const a=await account('a');const b=await account('b');
  const profile={firstname:'Тест',lastname:'Проверка',phone:'+7 (000) 123-45-67',billingAddress:'Тестовый адрес'};
  assert.equal((await call('updateProfile',profile)).status,401);
  const saved=await call('updateProfile',profile,a.cookie);assert.equal(saved.status,200);
  const current=await (await call('me',null,a.cookie)).json();assert.equal(current.firstname,'Тест');assert.equal(current.phone,profile.phone);
  const other=await (await call('me',null,b.cookie)).json();assert.equal(other.firstname || '','');
  assert.equal((await call('updateProfile',{firstname:'forged',id:other.id},a.cookie)).status,400);
  const aToken=decodeURIComponent(a.cookie.slice('token='.length));
  const direct=await fetch('http://127.0.0.1:1339/api/account/profile',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+aToken},body:JSON.stringify({id:other.id,role:1})});
  assert.equal(direct.status,400);
  assert.equal((await fetch('http://127.0.0.1:1339/api/users',{headers:{Authorization:'Bearer '+aToken}})).status,403);
  const unknown=await call('forgotPassword',{email:'unknown-'+Date.now()+'@example.test'});
  assert.equal(unknown.status,200);assert.deepEqual(await unknown.json(),{success:true});
  assert.equal((await call('forgotPassword',{email:a.email})).status,200);
  const expired=(await mail(a.email,'Восстановление')).match(/code=([a-f0-9]{128})/)?.[1];assert.ok(expired);
  await db.query('UPDATE up_users SET reset_password_expires_at=$1 WHERE email=$2',[new Date(Date.now()-60000),a.email]);
  const newPassword=crypto.randomBytes(24).toString('base64url');
  const resetData=code=>({code,password:newPassword,passwordConfirmation:newPassword});
  assert.equal((await call('resetPassword',resetData(expired))).status,400,'Expired link is rejected');
  assert.equal((await call('forgotPassword',{email:a.email})).status,200);
  const code=(await mail(a.email,'Восстановление')).match(/code=([a-f0-9]{128})/)?.[1];assert.ok(code);assert.notEqual(code,expired);
  const concurrent=await Promise.all([call('resetPassword',resetData(code)),call('resetPassword',resetData(code))]);
  assert.deepEqual(concurrent.map(res=>res.status).sort(),[200,400],'Only one concurrent reset succeeds');
  assert.equal((await call('resetPassword',resetData(code))).status,400,'Used link is rejected');
  assert.equal((await call('login',{identifier:a.email,password:a.password})).status,401);
  const restored=await call('login',{identifier:a.email,password:newPassword});assert.equal(restored.status,200);
  const cookie=restored.headers.get('set-cookie').split(';')[0];
  const finalPassword=crypto.randomBytes(24).toString('base64url');
  const change={currentPassword:'incorrect',password:finalPassword,passwordConfirmation:finalPassword};
  assert.equal((await call('changePassword',change,cookie)).status,400);
  assert.equal((await call('forgotPassword',{email:a.email})).status,200);
  const beforeChange=(await mail(a.email,'Восстановление')).match(/code=([a-f0-9]{128})/)?.[1];assert.ok(beforeChange);
  const changed=await call('changePassword',{...change,currentPassword:newPassword},cookie);assert.equal(changed.status,200);
  assert.equal((await call('resetPassword',resetData(beforeChange))).status,400,'Account password change cancels mailed links');
  assert.match(changed.headers.get('set-cookie'),/HttpOnly/);assert.equal((await changed.json()).jwt,undefined);
  assert.equal((await call('login',{identifier:a.email,password:newPassword})).status,401);
  assert.equal((await call('login',{identifier:a.email,password:finalPassword})).status,200);
  console.log('PASS: own profile persists; another account is untouched; forged fields and user listing denied; recovery response hides account existence; expired and reused links rejected; concurrent reset is single-use; old password rejected; current password checked; changed password works.');
} finally {await db.end();}
