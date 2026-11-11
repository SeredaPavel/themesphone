const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {authorization,exchange,validOrigin}=require('../src/lib/oauth-providers');
const {bridgeAuthorized}=require('../src/lib/oauth-service');
const keys=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','YANDEX_CLIENT_ID','YANDEX_CLIENT_SECRET','TELEGRAM_CLIENT_ID','TELEGRAM_CLIENT_SECRET','OAUTH_ALLOWED_ORIGINS','OAUTH_BRIDGE_SECRET'];
const before={...process.env};
afterEach(()=>{for(const key of keys)if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];});
const flow={origin:'https://themesphone.ru',state:'s'.repeat(43),verifier:'v'.repeat(43),nonce:'n'.repeat(43)};
function credentials(provider) {process.env[provider.toUpperCase()+'_CLIENT_ID']='test-client';process.env[provider.toUpperCase()+'_CLIENT_SECRET']='test-secret';}
function signed(claims,key) {
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
  return header+'.'+payload+'.'+crypto.sign('RSA-SHA256',Buffer.from(header+'.'+payload),key).toString('base64url');
}
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const otherKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
function transport(provider,overrides={},key=privateKey) {
  const issuer=provider==='google'?'https://accounts.google.com':'https://oauth.telegram.org';
  return async(url,options)=>{
    if(String(url).includes('jwks') || String(url).includes('certs')) return Response.json({keys:[{...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'}]});
    assert.match(String(url),/\/token$/);
    const body=new URLSearchParams(options.body);
    assert.equal(body.get('code_verifier'),flow.verifier);
    assert.equal(body.get('redirect_uri'),flow.origin+'/api/auth/'+provider+'/callback');
    assert.match(new Headers(options.headers).get('authorization'),/^Basic /);
    const now=Math.floor(Date.now()/1000);
    return Response.json({access_token:'provider-only-secret',token_type:'Bearer',expires_in:3600,id_token:signed({iss:issuer,aud:'test-client',sub:'external-123',iat:now,exp:now+300,nonce:flow.nonce,email:'user@example.test',email_verified:true,...overrides},key)});
  };
}
test('all providers use code flow, PKCE S256 and exact frontend callbacks; OIDC adds nonce',async()=>{
  for(const provider of ['google','yandex','telegram']) {
    credentials(provider);
    const url=new URL(await authorization(provider,flow));
    assert.equal(url.searchParams.get('response_type'),'code');
    assert.equal(url.searchParams.get('redirect_uri'),flow.origin+'/api/auth/'+provider+'/callback');
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('state'),flow.state);
    if(provider!=='yandex')assert.equal(url.searchParams.get('nonce'),flow.nonce);
    assert.doesNotMatch(url.href,/test-secret|provider-only-secret/);
  }
});
test('Google validates signed ID token and returns identity without provider tokens',async()=>{
  credentials('google');
  const result=await exchange('google',flow,{state:flow.state,code:'code'},transport('google'));
  assert.deepEqual(result,{subject:'external-123',email:'user@example.test'});
});
test('Telegram validates signature and has no invented email or userinfo request',async()=>{
  credentials('telegram');
  assert.deepEqual(await exchange('telegram',flow,{state:flow.state,code:'code'},transport('telegram')),{subject:'external-123',email:''});
});
test('forged signatures, expired tokens, wrong issuer/audience/nonce and state are rejected',async()=>{
  credentials('google');
  for(const bad of [{iss:'https://attacker.example'},{aud:'other-client'},{nonce:'wrong'},{exp:1}]) await assert.rejects(exchange('google',flow,{state:flow.state,code:'code'},transport('google',bad)));
  await assert.rejects(exchange('google',flow,{state:flow.state,code:'code'},transport('google',{},otherKey)));
  await assert.rejects(exchange('google',flow,{state:'wrong',code:'code'},transport('google')));
});
test('Yandex checks client and stable ID, obtains profile with Authorization header',async()=>{
  credentials('yandex');
  const fake=async(url,options)=>{
    if(String(url).includes('/info')) {assert.equal(options.headers.Authorization,'OAuth yandex-token');return Response.json({client_id:'test-client',id:'yandex-user',default_email:'user@yandex.test'});}
    const body=new URLSearchParams(options.body);assert.equal(body.get('code_verifier'),flow.verifier);assert.equal(body.get('client_secret'),'test-secret');
    return Response.json({access_token:'yandex-token',token_type:'bearer',expires_in:3600});
  };
  assert.deepEqual(await exchange('yandex',flow,{state:flow.state,code:'code'},fake),{subject:'yandex-user',email:'user@yandex.test'});
  await assert.rejects(exchange('yandex',flow,{state:flow.state,code:'code'},async(url,options)=>String(url).includes('/info')?Response.json({client_id:'other-client',id:'yandex-user'}):fake(url,options)));
});
test('bridge fails closed and allowed origins reject suffixes, paths and public HTTP',()=>{
  process.env.OAUTH_BRIDGE_SECRET='a'.repeat(64);
  assert.equal(bridgeAuthorized('a'.repeat(64)),true);
  for(const value of [undefined,'b'.repeat(64),'я'.repeat(64)])assert.equal(bridgeAuthorized(value),false);
  process.env.OAUTH_ALLOWED_ORIGINS='https://themesphone.ru,http://127.0.0.1:3100,http://public.example';
  assert.equal(validOrigin('https://themesphone.ru'),true);
  assert.equal(validOrigin('http://127.0.0.1:3100'),true);
  for(const value of ['https://themesphone.ru.evil.example','https://themesphone.ru/path','http://public.example'])assert.equal(validOrigin(value),false);
});
