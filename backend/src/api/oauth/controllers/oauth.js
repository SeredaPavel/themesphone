'use strict';
const {createOAuthService,bridgeAuthorized,OAuthError} = require('../../../lib/oauth-service');
const {validOrigin,digest} = require('../../../lib/oauth-providers');
const limits = new Map();
let service;
module.exports = {
  async bridge(ctx) {
    ctx.set('Cache-Control','no-store');
    if(process.env.OAUTH_ENABLED!=='true' || !bridgeAuthorized(ctx.get('x-oauth-bridge'))) {ctx.status=404;ctx.body={error:'unavailable'};return;}
    const input = ctx.request.body;
    if(!input || JSON.stringify(input).length>16384 || !validOrigin(input.origin) || !['providers','start','finish','pending','register','connections','unlink','requestEmail','requestPassword'].includes(input.action)) {ctx.status=400;ctx.body={error:'invalid_request'};return;}
    const now = Date.now();
    for(const [key,value] of limits) if(value.until<=now) limits.delete(key);
    const key = digest(String(input.clientIp || 'unknown').slice(0,128)+':'+input.action);
    const limit = limits.get(key) || {until:now+60000,count:0};
    if((limits.size>=10000 && !limits.has(key)) || ++limit.count>(['register','requestEmail','requestPassword'].includes(input.action)?5:input.action==='start'?15:60)) {ctx.status=429;ctx.body={error:'rate_limited'};return;}
    limits.set(key,limit);
    service ||= createOAuthService(strapi);
    try {ctx.body=await service[input.action](input);} catch(error) {
      ctx.status=error instanceof OAuthError?error.status:503;
      ctx.body={error:error instanceof OAuthError?error.code:'service_unavailable'};
      // Never log provider responses, authorization codes, tokens, or credentials.
    }
  },
};
