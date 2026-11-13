'use strict';
const crypto = require('node:crypto');
const providers = require('./oauth-providers');
const USER = 'plugin::users-permissions.user';
const FLOW = 'api::oauth-flow.oauth-flow';
const IDENTITY = 'api::oauth-identity.oauth-identity';
const capability = value => typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
class OAuthError extends Error {
  constructor(code,status=400) {super(code);this.code=code;this.status=status;}
}
function bridgeAuthorized(value) {
  const expected = process.env.OAUTH_BRIDGE_SECRET;
  if(!expected || !/^[a-f0-9]{64}$/.test(expected) || typeof value!=='string' || !/^[a-f0-9]{64}$/.test(value)) return false;
  return crypto.timingSafeEqual(Buffer.from(value),Buffer.from(expected));
}
async function emailLock(trx,email) {
  await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',['themesphone:email:'+email]);
}
function createOAuthService(strapi, providerApi=providers) {
  const query = uid => strapi.db.query(uid);
  const userService = () => strapi.plugin('users-permissions').service('user');
  const jwt = () => strapi.plugin('users-permissions').service('jwt');
  async function current(token,required=true) {
    try {
      const claims = await jwt().verify(token);
      const user = await query(USER).findOne({where:{id:claims.id}});
      if(user?.confirmed && !user.blocked) return user;
    } catch { /* A missing or invalid session never becomes a linking target. */ }
    if(required) throw new OAuthError('login_required',401);
    return null;
  }
  async function lockUser(trx,id) {
    const model = strapi.db.metadata.get(USER);
    await trx(model.tableName).where('id',id).forUpdate().first();
  }
  async function readFlow(ticket,origin,stage,trx) {
    if(!capability(ticket)) throw new OAuthError('invalid_flow');
    const key = providerApi.digest(ticket);
    if(trx) {
      const model = strapi.db.metadata.get(FLOW);
      await trx(model.tableName).where(model.attributes.key.columnName,key).forUpdate().first();
    }
    const flow = await query(FLOW).findOne({where:{key}});
    if(!flow || flow.consumedAt || new Date(flow.expiresAt).getTime()<=Date.now() || flow.payload.origin!==origin || flow.payload.stage!==stage) throw new OAuthError('invalid_flow');
    return flow;
  }
  async function consume(ticket,origin,stage,validate=()=>{}) {
    return strapi.db.transaction(async({trx})=>{
      const flow = await readFlow(ticket,origin,stage,trx);
      await validate(flow.payload);
      await query(FLOW).update({where:{id:flow.id},data:{consumedAt:new Date()}});
      return flow.payload;
    });
  }
  async function tokenFor(id) {
    const user = await query(USER).findOne({where:{id}});
    if(!user || user.blocked) throw new OAuthError('login_unavailable',403);
    if(!user.confirmed) throw new OAuthError('confirm_email',403);
    return {jwt:jwt().issue({id:user.id})};
  }
  const merger=()=>require('./oauth-account-merge').createAccountMerge(strapi,providerApi,current);
  return {
    async providers() {
      return {providers:providerApi.PROVIDERS.map(provider=>({provider,enabled:providerApi.configured(provider)}))};
    },
    async start(input) {
      const {provider,origin} = input;
      if(!providerApi.configured(provider)) throw new OAuthError('provider_unavailable',503);
      const mode = ['link','merge-verify'].includes(input.mode)?input.mode:'login';
      const user = mode!=='login'?await current(input.token):null;
      const mergeKey=mode==='merge-verify'?await merger().proofStart(input):undefined;
      const state = providerApi.random();
      const browser = providerApi.random();
      const flow = {stage:'authorize',provider,origin,mode,mergeKey,state,browserHash:providerApi.digest(browser),verifier:providerApi.random(),nonce:providerApi.random(),userId:user?.id,tokenHash:user?providerApi.digest(input.token):null};
      const url = await providerApi.authorization(provider,flow);
      await query(FLOW).create({data:{key:providerApi.digest(state),payload:flow,expiresAt:new Date(Date.now()+600000)}});
      // Expired verifiers/tickets are removed as part of the next start, not retained indefinitely.
      await query(FLOW).deleteMany({where:{expiresAt:{$lt:new Date()}}});
      return {url,browser};
    },
    async finish(input) {
      if(!capability(input.browser) || !providerApi.PROVIDERS.includes(input.provider)) throw new OAuthError('invalid_flow');
      if(!input.error && (typeof input.code!=='string' || !input.code || input.code.length>4096)) throw new OAuthError('invalid_flow');
      const flow = await consume(input.state,input.origin,'authorize',async flow=>{
        if(flow.provider!==input.provider || flow.browserHash!==providerApi.digest(input.browser)) throw new OAuthError('invalid_flow');
        if(flow.mode!=='login') {
          const user = await current(input.token);
          if(user.id!==flow.userId || flow.tokenHash!==providerApi.digest(input.token)) throw new OAuthError('login_required',401);
        }
      });
      if(input.error) throw new OAuthError('cancelled');
      let profile;
      try {profile = await providerApi.exchange(input.provider,flow,input);} catch {throw new OAuthError('provider_response_invalid');}
      const key = providerApi.digest(input.provider+':'+profile.subject);
      if(flow.mode==='merge-verify') return merger().prove(input,flow.mergeKey,key);
      if(flow.mode==='link') {
        const observed=await query(IDENTITY).findOne({where:{key},populate:['user']});
        const owners=[flow.userId,...(observed?.user?[observed.user.id]:[])];
        const result=await strapi.db.transaction(async({trx})=>{
          await merger().lockUsers(trx,owners);
          await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',['themesphone:identity:'+key]);
          const user = await current(input.token);
          if(user.id!==flow.userId) throw new OAuthError('login_required',401);
          const existing = await query(IDENTITY).findOne({where:{key},populate:['user']});
          if(existing && existing.user?.id!==user.id) {
            if(!owners.includes(existing.user?.id)) throw new OAuthError('merge_changed',409);
            return merger().begin(input,existing.user.id,trx);
          }
          if(!existing) {
            if(await query(IDENTITY).findOne({where:{provider:input.provider,user:user.id}})) throw new OAuthError('already_linked',409);
            await query(IDENTITY).create({data:{key,provider:input.provider,subject:profile.subject,user:user.id}});
          }
        });
        if(result?.mergePending) return result;
        return {...await tokenFor(flow.userId),linked:true};
      }
      const identity = await query(IDENTITY).findOne({where:{key},populate:['user']});
      if(identity?.user) return tokenFor(identity.user.id);
      const user = await strapi.db.transaction(async({trx})=>{
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',['themesphone:identity:'+key]);
        const existing = await query(IDENTITY).findOne({where:{key},populate:['user']});
        if(existing?.user) return {user:existing.user,created:false};
        // A provider email may identify an existing account, but never grants permission to merge it.
        const suggested = typeof profile.email==='string'?profile.email.trim().toLowerCase():'';
        if(suggested) {
          await emailLock(trx,suggested);
          if(await query(USER).findOne({where:{$or:[{email:{$eqi:suggested}},{username:suggested}]}})) throw new OAuthError('account_exists',409);
        }
        const settings = await strapi.store({type:'plugin',name:'users-permissions'}).get({key:'advanced'});
        if(!settings.allow_register) throw new OAuthError('registration_closed',403);
        const role = await query('plugin::users-permissions.role').findOne({where:{type:settings.default_role}});
        if(!role) throw new OAuthError('service_unavailable',503);
        // OAuth proves the service identity. Email remains absent until the owner chooses to add it.
        const created = await userService().add({username:'oauth_'+providerApi.random(),email:null,provider:'local',confirmed:true,blocked:false,role:role.id});
        await query(IDENTITY).create({data:{key,provider:input.provider,subject:profile.subject,user:created.id}});
        return {user:created,created:true};
      });
      return {...await tokenFor(user.user.id),created:user.created};
    },
    async pending(input) {
      const flow = await readFlow(input.pending,input.origin,'register');
      return {provider:flow.payload.provider,email:flow.payload.email};
    },
    async register(input) {
      const email = typeof input.email==='string'?input.email.trim().toLowerCase():'';
      if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length<6) throw new OAuthError('invalid_email');
      const user = await strapi.db.transaction(async({trx})=>{
        const flow = await readFlow(input.pending,input.origin,'register',trx);
        const key = providerApi.digest(flow.payload.provider+':'+flow.payload.subject);
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',['themesphone:identity:'+key]);
        await emailLock(trx,email);
        if(await query(USER).findOne({where:{$or:[{email:{$eqi:email}},{username:email}]}})) throw new OAuthError('account_exists',409);
        if(await query(IDENTITY).findOne({where:{key}})) throw new OAuthError('identity_in_use',409);
        const settings = await strapi.store({type:'plugin',name:'users-permissions'}).get({key:'advanced'});
        if(!settings.allow_register) throw new OAuthError('registration_closed',403);
        const role = await query('plugin::users-permissions.role').findOne({where:{type:settings.default_role}});
        if(!role) throw new OAuthError('service_unavailable',503);
        // Email is always confirmed by our own message; no invented Telegram email and no hidden password.
        const created = await userService().add({username:email,email,provider:'local',confirmed:false,blocked:false,role:role.id});
        await query(IDENTITY).create({data:{key,provider:flow.payload.provider,subject:flow.payload.subject,user:created.id}});
        await query(FLOW).update({where:{id:flow.id},data:{consumedAt:new Date()}});
        return created;
      });
      let mailSent = true;
      try {await userService().sendConfirmationEmail(user);} catch {mailSent=false;}
      return {registered:true,mailSent};
    },
    async connections(input) {
      const user = await current(input.token);
      const identities = await query(IDENTITY).findMany({where:{user:user.id}});
      return {email:user.email || null,hasPassword:!!user.password,connections:providerApi.PROVIDERS.map(provider=>({provider,enabled:providerApi.configured(provider),linked:identities.some(identity=>identity.provider===provider)}))};
    },
    async requestEmail(input) {
      const user = await current(input.token);
      return require('./oauth-account-links').requestAccountLink(strapi,input,user,'email');
    },
    async requestPassword(input) {
      const user = await current(input.token);
      return require('./oauth-account-links').requestAccountLink(strapi,input,user,'password');
    },
    async mergePreview(input) {return merger().preview(input);},
    async mergeCancel(input) {return merger().cancel(input);},
    async mergeConfirm(input) {
      const {primaryId}=await merger().confirm(input);
      return {...await tokenFor(primaryId),merged:true};
    },
    async unlink(input) {
      if(!providerApi.PROVIDERS.includes(input.provider)) throw new OAuthError('invalid_provider');
      const user = await current(input.token);
      await strapi.db.transaction(async({trx})=>{
        await lockUser(trx,user.id);
        const latest = await current(input.token);
        const identities = await query(IDENTITY).findMany({where:{user:user.id}});
        const selected = identities.find(identity=>identity.provider===input.provider);
        if(!selected) throw new OAuthError('not_linked');
        if(!latest.password && identities.length<=1) throw new OAuthError('last_login_method',409);
        await query(IDENTITY).delete({where:{id:selected.id}});
      });
      return {success:true};
    },
  };
}
module.exports = {createOAuthService,OAuthError,bridgeAuthorized,emailLock};
