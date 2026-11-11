const {test,afterEach} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {telegramProxyFetch,closeTelegramProxy} = require('../src/lib/oauth-transport');
const {exchange} = require('../src/lib/oauth-providers');
const before = {...process.env};
const originalFetch = globalThis.fetch;
const keys = ['TELEGRAM_PROXY_URL','TELEGRAM_CLIENT_ID','TELEGRAM_CLIENT_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','YANDEX_CLIENT_ID','YANDEX_CLIENT_SECRET'];
afterEach(async()=>{
  globalThis.fetch = originalFetch;
  await closeTelegramProxy();
  for(const key of keys) if(before[key]===undefined) delete process.env[key];else process.env[key]=before[key];
});
async function refusingProxy(t) {
  const requests = [];
  const server = http.createServer();
  server.on('connect',(request,socket)=>{
    requests.push({target:request.url,headers:request.headers});
    socket.on('error',()=>{});
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  process.env.TELEGRAM_PROXY_URL='http://127.0.0.1:'+server.address().port;
  return requests;
}
test('Telegram token and JWKS use CONNECT, deny other destinations and do not fall back when proxy refuses',async t=>{
  const requests = await refusingProxy(t);
  let directCalls=0;
  globalThis.fetch=async()=>{directCalls++;throw Error('Unexpected direct fetch');};
  const transport=telegramProxyFetch();
  for(const path of ['/token','/.well-known/jwks.json']) {
    await assert.rejects(transport('https://oauth.telegram.org'+path,{signal:AbortSignal.timeout(2000)}));
  }
  assert.equal(requests.length,2);
  assert.ok(requests.every(request=>request.target==='oauth.telegram.org:443' && !request.headers.authorization));
  for(const url of ['https://accounts.google.com/token','https://oauth.telegram.org.attacker.test/token','http://oauth.telegram.org/token']) {
    await assert.rejects(transport(url),/Invalid Telegram transport destination/);
  }
  assert.equal(requests.length,2);
  assert.equal(directCalls,0);
});
test('provider integration sends only Telegram through proxy; Google and Yandex stay direct',async t=>{
  const requests=await refusingProxy(t);
  const direct=[];
  globalThis.fetch=async(input)=>{
    direct.push(String(input));
    return Response.json({error:'invalid_grant'},{status:400});
  };
  const flow={origin:'https://themesphone.ru',state:'s'.repeat(43),verifier:'v'.repeat(43),nonce:'n'.repeat(43)};
  for(const provider of ['google','yandex','telegram']) {
    process.env[provider.toUpperCase()+'_CLIENT_ID']='test-client';
    process.env[provider.toUpperCase()+'_CLIENT_SECRET']='test-secret';
    await assert.rejects(exchange(provider,flow,{state:flow.state,code:'test-code'}));
  }
  assert.deepEqual(direct,['https://oauth2.googleapis.com/token','https://oauth.yandex.ru/token']);
  assert.equal(requests.length,1);
  assert.equal(requests[0].target,'oauth.telegram.org:443');
});
test('proxy is optional and malformed settings fail without revealing their value',()=>{
  delete process.env.TELEGRAM_PROXY_URL;
  assert.equal(telegramProxyFetch(),undefined);
  for(const value of ['socks5://proxy.test','http://user:private-value@proxy.test','http://proxy.test/path','http://proxy.test/?private-value','not-a-url']) {
    process.env.TELEGRAM_PROXY_URL=value;
    assert.throws(()=>telegramProxyFetch(),error=>error.message==='Invalid Telegram proxy configuration');
  }
});
