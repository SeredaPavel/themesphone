import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {emailSettings,plainText,installPlainText}=require('../../backend/src/lib/auth-mail.js');
test('production email links use explicit HTTPS frontend and configured sender',()=>{
  const settings=emailSettings('https://themesphone.ru','noreply.themesphone@yandex.ru');
  assert.match(settings.confirmation.message,/https:\/\/themesphone.ru\/auth\/confirm-email\?confirmation=<%= CODE %>/);
  assert.doesNotMatch(settings.confirmation.message,/localhost|127\.0\.0\.1|cms\.themesphone/);
  assert.equal(settings.resetUrl,'https://themesphone.ru/auth/reset-password');
  assert.throws(()=>emailSettings('http://themesphone.ru','sender@example.test'));
  assert.throws(()=>emailSettings('https://themesphone.ru/path','sender@example.test'));
});
test('mail text alternative retains real confirmation links and existing plain text',async()=>{
  const html='<p>Подтвердите почту</p><a href="https://themesphone.ru/auth/confirm-email?confirmation=abc">Подтвердить</a>';
  assert.match(plainText(html),/https:\/\/themesphone.ru\/auth\/confirm-email\?confirmation=abc/);
  let sent;
  const service={send:async options=>{sent=options;}};
  installPlainText({plugin:()=>({service:()=>service})});
  await service.send({html,text:html});
  assert.doesNotMatch(sent.text,/<p>|<a/);
  await service.send({html,text:'Custom plain text'});
  assert.equal(sent.text,'Custom plain text');
});
