'use strict';
const crypto = require('node:crypto');
const PROVIDERS = ['google', 'yandex', 'telegram'];
const metadata = {
  google: {issuer:'https://accounts.google.com',authorization_endpoint:'https://accounts.google.com/o/oauth2/v2/auth',token_endpoint:'https://oauth2.googleapis.com/token',jwks_uri:'https://www.googleapis.com/oauth2/v3/certs'},
  telegram: {issuer:'https://oauth.telegram.org',authorization_endpoint:'https://oauth.telegram.org/auth',token_endpoint:'https://oauth.telegram.org/token',jwks_uri:'https://oauth.telegram.org/.well-known/jwks.json'},
  yandex: {issuer:'https://oauth.yandex.ru',authorization_endpoint:'https://oauth.yandex.ru/authorize',token_endpoint:'https://oauth.yandex.ru/token'},
};
function configured(provider) {
  return PROVIDERS.includes(provider) && !!process.env[provider.toUpperCase()+'_CLIENT_ID'] && !!process.env[provider.toUpperCase()+'_CLIENT_SECRET'];
}
const random = () => crypto.randomBytes(32).toString('base64url');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function validOrigin(origin) {
  try {
    const url = new URL(origin);
    if(url.origin!==origin || (url.protocol!=='https:' && !['http://127.0.0.1:3100','http://localhost:3100'].includes(origin))) return false;
    return (process.env.OAUTH_ALLOWED_ORIGINS || '').split(',').map(value=>value.trim()).includes(origin);
  } catch {return false;}
}
async function configuration(provider, customFetch) {
  const client = await import('openid-client');
  const prefix = provider.toUpperCase();
  const config = new client.Configuration(metadata[provider],process.env[prefix+'_CLIENT_ID'],
    {id_token_signed_response_alg:'RS256'},
    provider==='telegram' ? client.ClientSecretBasic(process.env[prefix+'_CLIENT_SECRET']) : client.ClientSecretPost(process.env[prefix+'_CLIENT_SECRET']));
  config.timeout = 10;
  if(customFetch) config[client.customFetch] = customFetch;
  if(provider!=='yandex') client.enableNonRepudiationChecks(config);
  return {client,config};
}
async function authorization(provider, flow) {
  const {client,config} = await configuration(provider);
  return client.buildAuthorizationUrl(config,{
    redirect_uri:flow.origin+'/api/auth/'+provider+'/callback',response_type:'code',
    scope:provider==='google'?'openid email profile':provider==='telegram'?'openid profile':'login:email',
    state:flow.state,code_challenge:await client.calculatePKCECodeChallenge(flow.verifier),code_challenge_method:'S256',
    ...(provider==='yandex'?{}:{nonce:flow.nonce}),
  }).href;
}
async function exchange(provider, flow, input, customFetch) {
  const {client,config} = await configuration(provider,customFetch);
  const callback = new URL(flow.origin+'/api/auth/'+provider+'/callback');
  callback.searchParams.set('state',input.state);
  if(input.error) callback.searchParams.set('error','access_denied');
  else callback.searchParams.set('code',input.code);
  const tokens = await client.authorizationCodeGrant(config,callback,{
    expectedState:flow.state,pkceCodeVerifier:flow.verifier,
    ...(provider==='yandex'?{}:{expectedNonce:flow.nonce,idTokenExpected:true}),
  });
  if(provider==='yandex') {
    const response = await (customFetch || fetch)('https://login.yandex.ru/info?format=json',{
      headers:{Authorization:'OAuth '+tokens.access_token},signal:AbortSignal.timeout(10000),redirect:'error',
    });
    if(!response.ok) throw Error('Provider profile unavailable');
    const profile = await response.json();
    if(profile.client_id!==process.env.YANDEX_CLIENT_ID || typeof profile.id!=='string' || !profile.id || profile.id.length>255) throw Error('Invalid provider identity');
    return {subject:profile.id,email:typeof profile.default_email==='string'?profile.default_email:''};
  }
  const claims = tokens.claims();
  if(!claims || typeof claims.sub!=='string' || !claims.sub || claims.sub.length>255) throw Error('Invalid provider identity');
  return {subject:claims.sub,email:provider==='google' && claims.email_verified===true && typeof claims.email==='string'?claims.email:''};
}
module.exports = {PROVIDERS,configured,random,digest,validOrigin,authorization,exchange};
