// Local only: separate database; captured SMTP unless --smtp-yandex is explicit.
// Never reads backend/.env. SMTP credentials are loaded only from the ignored local file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const backendDir = path.join(root, 'backend');
const envPath = path.join(root, '.local/auth/backend.env');
const requireBackend = createRequire(path.join(backendDir, 'package.json'));
const secret = () => crypto.randomBytes(32).toString('hex');

async function main() {
  if (process.argv[2] === 'setup') {
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    if (fs.existsSync(envPath)) { console.log('Local auth environment already exists; preserved.'); return; }
    const values = {
      NODE_ENV:'development', HOST:'127.0.0.1', PORT:'1339',
      DATABASE_CLIENT:'postgres', DATABASE_HOST:'127.0.0.1', DATABASE_PORT:'5434',
      DATABASE_NAME:'themesphone_auth_dev', DATABASE_USERNAME:'themesphone_auth', DATABASE_PASSWORD:secret(), DATABASE_SSL:'false',
      APP_KEYS:[secret(),secret(),secret(),secret()].join(','), API_TOKEN_SALT:secret(), ADMIN_JWT_SECRET:secret(), TRANSFER_TOKEN_SALT:secret(), JWT_SECRET:secret(),
      STRAPI_ADMIN_BACKEND_URL:'http://127.0.0.1:1339', FRONTEND_URL:'http://127.0.0.1:3100',
      SMTP_HOST:'127.0.0.1', SMTP_PORT:'1026', SMTP_SECURE:'false', SMTP_FROM:'ThemesPhone <no-reply@themesphone.test>',
      STRAPI_TELEMETRY_DISABLED:'true', STRAPI_DISABLE_UPDATE_NOTIFICATION:'true',
    };
    fs.writeFileSync(envPath, Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n', { flag:'wx', mode:0o600 });
    console.log('Created .local/auth/backend.env. Secrets are not printed.');
    return;
  }
  const options=process.argv.slice(3);
  if (process.argv[2] !== 'start' || options.some(arg=>!['--smtp-yandex','--oauth'].includes(arg) && !arg.startsWith('--send-test='))) throw new Error('Usage: node scripts/local-auth.cjs setup|start [--smtp-yandex] [--oauth] [--send-test=recipient]');
  const recipients=options.filter(arg=>arg.startsWith('--send-test=')).map(arg=>arg.slice('--send-test='.length));
  if(recipients.length>1) throw new Error('Only one test recipient is allowed.');
  const testRecipient=recipients[0];
  if(testRecipient && (!options.includes('--smtp-yandex') || testRecipient.length>254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(testRecipient))) throw new Error('The test email requires Yandex mode and a valid single recipient.');
  process.env.ENV_PATH = envPath;
  requireBackend('dotenv').config({ path:envPath, override:true });
  // Do not permit a command-line/inherited DATABASE_URL to select another database.
  delete process.env.DATABASE_URL;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  const yandex = process.argv.includes('--smtp-yandex');
  if (yandex) {
    const smtpPath=path.join(root,'.local/smtp/backend.env');
    if (!fs.existsSync(smtpPath)) throw new Error('Create .local/smtp/backend.env first.');
    const smtp=requireBackend('dotenv').parse(fs.readFileSync(smtpPath));
    if (!smtp.SMTP_PASS || !smtp.SMTP_PASS.trim()) throw new Error('Enter the app password locally in .local/smtp/backend.env. The password is never printed.');
    if (smtp.SMTP_HOST!=='smtp.yandex.ru' || smtp.SMTP_PORT!=='465' || smtp.SMTP_SECURE!=='true' || smtp.SMTP_USER!=='noreply.themesphone@yandex.ru') throw new Error('Unexpected Yandex SMTP settings.');
    for (const key of ['SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','SMTP_FROM','SMTP_REPLY_TO']) {
      if(typeof smtp[key]==='string') process.env[key]=smtp[key];
    }
  }
  process.env.DOCUMENTATION_ENABLED = 'false';
  process.env.AUTH_CONFIGURE_EMAIL = 'false';
  process.env.OAUTH_ENABLED = 'false';
  if(options.includes('--oauth')) {
    const oauth=requireBackend('dotenv').parse(fs.readFileSync(path.join(root,'.local/oauth/backend.env')));
    for(const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','YANDEX_CLIENT_ID','YANDEX_CLIENT_SECRET','TELEGRAM_CLIENT_ID','TELEGRAM_CLIENT_SECRET','OAUTH_BRIDGE_SECRET']) {
      if(!oauth[key]) throw Error('Missing OAuth setting: '+key);
      process.env[key]=oauth[key];
    }
    process.env.OAUTH_ENABLED='true';
    process.env.OAUTH_ALLOWED_ORIGINS='http://127.0.0.1:3100,http://localhost:3100';
  }
  if (process.env.DATABASE_NAME !== 'themesphone_auth_dev' || process.env.DATABASE_HOST !== '127.0.0.1' || process.env.DATABASE_PORT !== '5434' || process.env.NODE_ENV !== 'development') throw new Error('Refusing to use a non-isolated database.');
  process.chdir(backendDir);
  const { createStrapi } = requireBackend('@strapi/strapi');
  const strapi = createStrapi({ appDir:backendDir, distDir:backendDir });
  await strapi.load();
  const store = strapi.store({ type:'plugin', name:'users-permissions' });
  const advanced = await store.get({ key:'advanced' });
  const grant = await store.get({ key:'grant' });
  for (const [provider, config] of Object.entries(grant)) config.enabled = provider === 'email';
  await store.set({ key:'grant', value:grant });
  await store.set({ key:'advanced', value:{...advanced, allow_register:true, unique_email:true, email_confirmation:true, email_confirmation_redirection:'http://127.0.0.1:3100/confirmation/submit', email_reset_password:'http://127.0.0.1:3100/auth/reset-password'} });
  const email = await store.get({ key:'email' });
  const senderAddress=yandex ? process.env.SMTP_USER : 'no-reply@themesphone.test';
  const {emailSettings,installPlainText}=require('../backend/src/lib/auth-mail');
  const templates=emailSettings('http://127.0.0.1:3100',senderAddress);
  email.email_confirmation.options=templates.confirmation;
  email.reset_password.options=templates.reset;
  installPlainText(strapi);
  await store.set({ key:'email', value:email });
  // Public access only to published catalogue data. Never grant user/order listing.
  for (const role of await strapi.db.query('plugin::users-permissions.role').findMany({where:{type:{$in:['public','authenticated']}}})) {
    const actions = ['api::wallpaper.wallpaper.find','api::wallpaper.wallpaper.findOne','api::category.category.find','api::category.category.findOne','api::device.device.find','api::device.device.findOne'];
    if (role.type === 'authenticated') actions.push('plugin::users-permissions.user.me','plugin::users-permissions.auth.changePassword','api::account.account.updateProfile');
    for (const action of actions) {
      if (!await strapi.db.query('plugin::users-permissions.permission').findOne({where:{action,role:role.id}})) await strapi.db.query('plugin::users-permissions.permission').create({data:{action,role:role.id}});
    }
  }
  await strapi.start();
  const runtimePath=path.join(root,'.local/auth/runtime.json');
  fs.writeFileSync(runtimePath,JSON.stringify({pid:process.pid,port:1339,mailTransport:yandex?'yandex':'mailpit',startedAt:new Date().toISOString()},null,2));
  if(testRecipient) {
    const receiptPath=path.join(root,'.local/smtp/test-email-result.json');
    const receipt={to:testRecipient,from:senderAddress,attemptedAt:new Date().toISOString(),status:'pending'};
    fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
    try {
      // Explicitly one message, no automatic retry and no registration/token side effects.
      const info=await strapi.plugin('email').service('email').send({
        from:`ThemesPhone <${senderAddress}>`,replyTo:senderAddress,to:testRecipient,
        subject:'ThemesPhone — проверка отправки из Strapi',
        text:'Здравствуйте!\n\nЭто однократное тестовое письмо ThemesPhone. Оно отправлено из локального Strapi через SMTP Яндекса для проверки доставки.\n\nЕсли вы видите это письмо, пожалуйста, сообщите, попало ли оно во «Входящие» или в «Спам».\n\nThemesPhone',
      });
      const accepted=Array.isArray(info.accepted) && info.accepted.includes(testRecipient) && !info.rejected?.length;
      fs.writeFileSync(receiptPath,JSON.stringify({...receipt,status:accepted?'accepted':'not-accepted',messageId:info.messageId || null,completedAt:new Date().toISOString()},null,2));
      if(!accepted) throw new Error('SMTP_RECIPIENT_NOT_ACCEPTED');
      console.log('TEST_EMAIL_ACCEPTED: '+testRecipient+'; subject: ThemesPhone — проверка отправки из Strapi.');
    } catch(error) {
      const safeCodes=new Set(['EAUTH','ESOCKET','ECONNECTION','ETIMEDOUT','EDNS','EENVELOPE','EMESSAGE']);
      const code=safeCodes.has(error.code)?error.code:'SMTP_ERROR';
      fs.writeFileSync(receiptPath,JSON.stringify({...receipt,status:'failed-or-unknown',code,completedAt:new Date().toISOString()},null,2));
      console.error('TEST_EMAIL_FAILED: '+code+'. No automatic retry; credentials and raw SMTP response are not logged.');
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
