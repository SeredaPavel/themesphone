'use strict';
const {ProxyAgent,fetch:proxyFetch} = require('undici');
let cached;

function telegramProxyFetch() {
  const setting = (process.env.TELEGRAM_PROXY_URL || '').trim();
  if(!setting) return undefined;
  if(cached?.setting===setting) return cached.fetch;
  let proxy;
  try {
    proxy = new URL(setting);
    if(!['http:','https:'].includes(proxy.protocol) || proxy.username || proxy.password || proxy.pathname!=='/' || proxy.search || proxy.hash) throw Error();
  } catch {throw Error('Invalid Telegram proxy configuration');}
  const dispatcher = new ProxyAgent(proxy.origin);
  const transport = async(input,options)=>{
    const target = new URL(typeof input==='string' || input instanceof URL ? input : input.url);
    if(target.origin!=='https://oauth.telegram.org' || target.username || target.password) throw Error('Invalid Telegram transport destination');
    return proxyFetch(input,{...options,dispatcher,redirect:'error'});
  };
  if(cached) cached.dispatcher.close().catch(()=>{});
  cached = {setting,dispatcher,fetch:transport};
  return transport;
}

async function closeTelegramProxy() {
  const previous = cached;
  cached = undefined;
  if(previous) await previous.dispatcher.close();
}

module.exports = {telegramProxyFetch,closeTelegramProxy};
