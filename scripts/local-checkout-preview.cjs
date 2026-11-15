'use strict';
// Start the frontend only. Backend: local-auth.cjs start --payments-test.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),frontend=path.join(root,'frontend');
const values=require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root,'.local/payments/frontend.env')));
if(!values.PAYMENT_WEBHOOK_BRIDGE_SECRET||values.PAYMENT_WEBHOOK_BRIDGE_SECRET.length<43)throw Error('Start the local test backend first.');
const build=process.argv.includes('--build');
const env={...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
  STRAPI_API_URL:'http://127.0.0.1:1339',NEXT_PUBLIC_STRAPI_URL:'http://127.0.0.1:1339',FRONTEND_URL:'http://127.0.0.1:3100',
  AUTH_ALLOWED_ORIGINS:'http://127.0.0.1:3100,http://localhost:3100',OAUTH_ENABLED:'false',ORDERS_ENABLED:'true',PAYMENTS_ENABLED:'true',
  PAYMENT_WEBHOOK_BRIDGE_SECRET:values.PAYMENT_WEBHOOK_BRIDGE_SECRET,
  S3_PREVIEWS_BUCKET:'themesphone-previews',S3_ORIGINALS_BUCKET:'themesphone-originals'};
for(const key of ['STRAPI_API_TOKEN','YOOKASSA_SECRET_KEY','YOOKASSA_SHOP_ID','S3_SECRET_ACCESS_KEY','S3_ACCESS_KEY_ID'])delete env[key];
const child=spawn(process.execPath,[path.join(frontend,'node_modules/next/dist/bin/next'),build?'build':'start',...(build?[]:['--hostname','127.0.0.1','--port','3100'])],{cwd:frontend,env,stdio:'inherit',windowsHide:true});
if(!build)fs.writeFileSync(path.join(root,'.local/payments/preview-runtime.json'),JSON.stringify({pid:process.pid,nextPid:child.pid,port:3100,mode:'test'},null,2));
child.on('exit',code=>process.exit(code||0));
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());
