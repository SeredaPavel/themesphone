'use strict';
// Checks TLS and SMTP authentication only. No message is sent and no secret is logged.
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname,'..');
const requireBackend = createRequire(path.join(root,'backend/package.json'));

async function main() {
  const configPath=path.join(root,'.local/smtp/backend.env');
  let settings;
  try { settings=requireBackend('dotenv').parse(fs.readFileSync(configPath)); }
  catch { console.error('CONFIG: unable to read the local SMTP settings file.'); process.exitCode=1; return; }
  if(settings.SMTP_HOST!=='smtp.yandex.ru' || settings.SMTP_PORT!=='465' || settings.SMTP_SECURE!=='true' || settings.SMTP_USER!=='noreply.themesphone@yandex.ru' || !settings.SMTP_PASS?.trim()) {
    console.error('CONFIG: check host, port, TLS, account and app password locally. Values are not printed.');
    process.exitCode=1; return;
  }
  const transport=requireBackend('nodemailer').createTransport({
    host:settings.SMTP_HOST, port:465, secure:true,
    auth:{user:settings.SMTP_USER,pass:settings.SMTP_PASS},
    tls:{servername:'smtp.yandex.ru',minVersion:'TLSv1.2'},
    connectionTimeout:15000, greetingTimeout:15000, socketTimeout:20000,
    logger:false, debug:false,
  });
  try {
    await transport.verify();
    console.log('PASS: verified TLS connection and SMTP authentication for noreply.themesphone@yandex.ru. No email was sent.');
  } catch(error) {
    // Never print the error object, raw SMTP response or transport configuration.
    const allowed=new Set(['EAUTH','ESOCKET','ECONNECTION','ETIMEDOUT','EDNS','ECONNREFUSED','ECONNRESET']);
    const code=allowed.has(error.code)?error.code:'SMTP_ERROR';
    const status=Number.isInteger(error.responseCode)?' SMTP status '+error.responseCode:'';
    console.error('FAIL: '+code+status+'. Credentials and server response are not printed.');
    process.exitCode=1;
  } finally { transport.close(); }
}
main().catch(()=>{console.error('FAIL: SMTP check could not be completed. No diagnostic secrets are printed.');process.exitCode=1;});
