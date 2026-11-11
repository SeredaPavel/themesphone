import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as auth from '../frontend/src/lib/email-auth.ts';
const invoke = (name, request) => process.argv.includes('--http') ? fetch(request) : auth[name](request);
const login = request => invoke('login',request);
const register = request => invoke('register',request);
const confirmEmail = request => invoke('confirmEmail',request);
const me = request => invoke('me',request);
const logout = request => invoke('logout',request);
const runtime=JSON.parse(fs.readFileSync(new URL('../.local/auth/runtime.json',import.meta.url),'utf8'));
if(runtime.mailTransport!=='mailpit') throw new Error('Use Mailpit mode for automated auth checks; sending test accounts to real SMTP is refused.');

// Generates disposable accounts only in the explicitly named local test environment.
process.env.STRAPI_API_URL = 'http://127.0.0.1:1339';
process.env.FRONTEND_URL = 'http://127.0.0.1:3100';
const email = 'auth-check-' + Date.now() + '@example.test';
const password = crypto.randomBytes(24).toString('base64url');
function req(route, payload, cookie) {
  return new Request('http://127.0.0.1:3100/api/' + route, {method:payload ? 'POST' : 'GET', headers:{Origin:process.env.FRONTEND_URL,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
}
assert.equal((await register(req('register',{email,password}))).status,200);
assert.equal((await login(req('login',{identifier:email,password}))).status,401);
const messages = await fetch('http://127.0.0.1:8026/api/v1/messages').then(r=>r.json());
const matching = messages.messages.filter(message=>message.To.some(to=>to.Address===email));
assert.equal(matching.length,1,'Registration must send exactly one confirmation email');
const message = await fetch('http://127.0.0.1:8026/api/v1/message/' + matching[0].ID).then(r=>r.json());
const token = (message.HTML || message.Text).match(/confirmation=([a-f0-9]{40})/)?.[1];
assert.match(message.Text,/confirmation=[a-f0-9]{40}/,'Plain text alternative keeps the confirmation link');
assert.doesNotMatch(message.Text,/<html|<a href=/);
assert.ok(token,'Email contains a link to confirm the account');
assert.equal((await confirmEmail(req('auth/email-confirmation',{confirmation:token}))).status,200);
assert.equal((await confirmEmail(req('auth/email-confirmation',{confirmation:token}))).status,400);
assert.equal((await login(req('login',{identifier:email,password:'wrong-password'}))).status,401);
const response = await login(req('login',{identifier:email,password}));
assert.equal(response.status,200);
const session = response.headers.get('set-cookie');
assert.match(session,/HttpOnly/);
assert.match(session,/SameSite=Lax/);
const data = await response.json();
assert.equal(data.user.email,email);
assert.equal(data.jwt,undefined);
const cookie = session.split(';')[0];
assert.equal((await me(req('me',null,cookie))).status,200);
assert.equal((await me(req('me'))).status,401);
assert.match((await logout(req('auth/logout',{},cookie))).headers.get('set-cookie'),/Max-Age=0/);
const crossOrigin = new Request('http://127.0.0.1:3100/api/login',{method:'POST',headers:{Origin:'https://other.example'},body:JSON.stringify({identifier:email,password})});
assert.equal((await login(crossOrigin)).status,403);
console.log('PASS: registration sends one email; unconfirmed login rejected; confirmation is single-use; wrong password rejected; HttpOnly session; /me; logout; cross-origin rejection.');
