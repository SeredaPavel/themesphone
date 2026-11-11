// This helper never prints credentials and never reads production database settings.
const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const dotenv=require('../backend/node_modules/dotenv');
const backend=path.join(root,'.local/oauth/backend.env');
const frontend=path.join(root,'.local/oauth/frontend.env');
if(process.argv[2]==='setup') {
  execFileSync('git',['check-ignore','--quiet',backend],{cwd:root});
  const values=dotenv.parse(fs.readFileSync(backend));
  if(!values.OAUTH_BRIDGE_SECRET) {
    fs.mkdirSync(path.join(root,'.local/backups/oauth'),{recursive:true});
    fs.copyFileSync(backend,path.join(root,'.local/backups/oauth/backend-'+Date.now()+'.env'),fs.constants.COPYFILE_EXCL);
    values.OAUTH_BRIDGE_SECRET=randomBytes(32).toString('hex');
    fs.appendFileSync(backend,'\nOAUTH_BRIDGE_SECRET='+values.OAUTH_BRIDGE_SECRET+'\n');
  }
  if(!/^[a-f0-9]{64}$/.test(values.OAUTH_BRIDGE_SECRET)) throw Error('Invalid bridge key');
  if(fs.existsSync(frontend)) {
    if(dotenv.parse(fs.readFileSync(frontend)).OAUTH_BRIDGE_SECRET!==values.OAUTH_BRIDGE_SECRET) throw Error('Existing frontend bridge setting differs; preserved');
  } else fs.writeFileSync(frontend,'# Server-only BFF credential. No provider secrets belong here.\nOAUTH_ENABLED=true\nOAUTH_BRIDGE_SECRET='+values.OAUTH_BRIDGE_SECRET+'\n',{flag:'wx',mode:0o600});
  console.log('Local OAuth bridge configured; credentials were not printed.');
} else if(process.argv[2]==='frontend') {
  const env={...process.env,...dotenv.parse(fs.readFileSync(frontend)),FRONTEND_URL:'http://127.0.0.1:3100',STRAPI_API_URL:'http://127.0.0.1:1339',STRAPI_API_TOKEN:'',NEXT_TELEMETRY_DISABLED:'1',AUTH_ALLOWED_ORIGINS:'http://127.0.0.1:3100,http://localhost:3100'};
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3100','-H','127.0.0.1'],{cwd:path.join(root,'frontend'),env,stdio:'inherit'});
  child.on('exit',code=>process.exitCode=code);
} else throw Error('Usage: node scripts/local-oauth.cjs setup|frontend');
