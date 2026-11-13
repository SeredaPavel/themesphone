'use strict';

const {OAuthError}=require('./oauth-service');
const {profileFields}=require('./profile-fields');
const USER='plugin::users-permissions.user';
const FLOW='api::oauth-flow.oauth-flow';
const IDENTITY='api::oauth-identity.oauth-identity';
const ORDER='api::order.order';
const capability=value=>typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const hasPassword=user=>typeof user.password==='string' && user.password.length>0;

// Retain the account that owns the email/password. Never discard a second login
// address or choose between two different identities of the same provider.
function mergePlan(current,other,currentIdentities,otherIdentities) {
  if(!current || !other || current.id===other.id || [current,other].some(user=>user.blocked || !user.confirmed || user.mergedIntoUserId)) throw new OAuthError('merge_changed',409);
  if(!current.role || !other.role || current.role.type!=='authenticated' || other.role.type!=='authenticated' || current.role.id!==other.role.id) throw new OAuthError('merge_role_conflict',409);
  const currentLogin=!!current.email || hasPassword(current),otherLogin=!!other.email || hasPassword(other);
  if(currentLogin && otherLogin) throw new OAuthError('merge_email_conflict',409);
  const primary=otherLogin?other:current;
  const secondary=primary.id===current.id?other:current;
  const identities=[...currentIdentities,...otherIdentities];
  if(!currentIdentities.length && !hasPassword(current)) throw new OAuthError('merge_changed',409);
  if(!otherIdentities.length || new Set(identities.map(identity=>identity.provider)).size!==identities.length) throw new OAuthError('merge_provider_conflict',409);
  return {primary,secondary,identities};
}

function createAccountMerge(strapi,providerApi,currentUser) {
  const query=uid=>strapi.db.query(uid);
  const digest=providerApi.digest;
  async function lockUsers(trx,ids) {
    const table=strapi.db.metadata.get(USER).tableName;
    for(const id of [...new Set(ids)].sort((a,b)=>a-b)) await trx(table).where('id',id).forUpdate().first();
  }
  async function account(id) {
    return query(USER).findOne({where:{id},populate:['role']});
  }
  async function identities(id) {
    return query(IDENTITY).findMany({where:{user:id},orderBy:{id:'asc'}});
  }
  function signature(user,entries) {
    return digest(JSON.stringify([user.id,user.email || null,user.password || null,user.confirmed,user.blocked,user.mergedIntoUserId || null,user.role?.id,entries.map(item=>[item.id,item.provider,item.key])]));
  }
  async function pair(currentId,otherId) {
    const current=await account(currentId),other=await account(otherId);
    const documents=[current?.documentId,other?.documentId].filter(Boolean);
    if(documents.length) {
      const versions=await query(USER).findMany({where:{documentId:{$in:documents}},select:['id']});
      if((documents.length===2 && documents[0]===documents[1]) || versions.some(user=>![currentId,otherId].includes(user.id))) throw new OAuthError('merge_data_conflict',409);
    }
    const a=await identities(currentId),b=await identities(otherId);
    const plan=mergePlan(current,other,a,b);
    return {...plan,current,other,a,b};
  }
  async function read(input,trx) {
    if(!capability(input.merge)) throw new OAuthError('invalid_merge',400);
    const key=digest(input.merge);
    if(trx) {
      const meta=strapi.db.metadata.get(FLOW);
      await trx(meta.tableName).where(meta.attributes.key.columnName,key).forUpdate().first();
    }
    const flow=await query(FLOW).findOne({where:{key}});
    if(!flow || flow.payload.stage!=='merge' || flow.consumedAt || new Date(flow.expiresAt).getTime()<=Date.now() || flow.payload.origin!==input.origin) throw new OAuthError('invalid_merge',400);
    const current=await currentUser(input.token);
    if(current.id!==flow.payload.currentId || digest(input.token)!==flow.payload.tokenHash) throw new OAuthError('invalid_merge',400);
    return flow;
  }
  function unchanged(flow,accounts) {
    if(signature(accounts.current,accounts.a)!==flow.payload.currentSignature || signature(accounts.other,accounts.b)!==flow.payload.otherSignature) throw new OAuthError('merge_changed',409);
  }
  function verified(flow,accounts) {
    const proof=flow.payload.currentProof;
    return !!proof && proof.at>Date.now()-300000 && accounts.a.some(identity=>identity.key===proof.identityKey);
  }
  // New owned resource types must get an explicit transfer policy before merging.
  function supportedRelations() {
    const supported=new Set([ORDER,IDENTITY,'plugin::users-permissions.role']);
    for(const [uid,model] of Object.entries(strapi.contentTypes)) {
      const owned=Object.entries(model.attributes || {}).some(([field,attr])=>attr.type==='relation' && attr.target===USER && !(uid===USER && field==='localizations'));
      if(!supported.has(uid) && owned) throw new OAuthError('merge_data_conflict',409);
    }
  }
  async function orders(userId) {
    return query(ORDER).findMany({where:{users_permissions_user:{id:userId}},select:['id','documentId']});
  }
  return {
    lockUsers,
    async begin(input,otherId,trx) {
      // The caller already holds both user locks and the source identity lock.
      const current=await currentUser(input.token);
      const accounts=await pair(current.id,otherId);
      supportedRelations();
      const ticket=providerApi.random();
      await query(FLOW).create({data:{key:digest(ticket),payload:{stage:'merge',origin:input.origin,currentId:current.id,otherId,provider:input.provider,tokenHash:digest(input.token),currentSignature:signature(accounts.current,accounts.a),otherSignature:signature(accounts.other,accounts.b),passwordAttempts:0},expiresAt:new Date(Date.now()+600000)}});
      return {mergePending:ticket};
    },
    async preview(input) {
      const flow=await read(input),accounts=await pair(flow.payload.currentId,flow.payload.otherId);
      unchanged(flow,accounts);supportedRelations();
      const transferred=await orders(accounts.secondary.id);
      return {
        provider:flow.payload.provider,
        primaryEmail:accounts.primary.email || null,
        primaryIsCurrent:accounts.primary.id===accounts.current.id,
        providers:accounts.identities.map(identity=>identity.provider),
        orderCount:new Set(transferred.map(order=>order.documentId || order.id)).size,
        requiresPassword:hasPassword(accounts.current),
        verified:verified(flow,accounts),
        proofProviders:accounts.a.map(identity=>identity.provider).filter(provider=>providerApi.configured(provider)),
      };
    },
    async proofStart(input) {
      const flow=await read(input),accounts=await pair(flow.payload.currentId,flow.payload.otherId);
      unchanged(flow,accounts);
      if(!accounts.a.some(identity=>identity.provider===input.provider)) throw new OAuthError('merge_wrong_account',403);
      return flow.key;
    },
    async prove(input,mergeKey,identityKey) {
      const flow=await read(input);
      if(flow.key!==mergeKey) throw new OAuthError('invalid_merge',400);
      await strapi.db.transaction(async({trx})=>{
        const latest=await read(input,trx);
        await lockUsers(trx,[latest.payload.currentId,latest.payload.otherId]);
        const accounts=await pair(latest.payload.currentId,latest.payload.otherId);
        unchanged(latest,accounts);
        if(!accounts.a.some(identity=>identity.key===identityKey)) throw new OAuthError('merge_wrong_account',403);
        await query(FLOW).update({where:{id:latest.id},data:{payload:{...latest.payload,currentProof:{identityKey,at:Date.now()}}}});
      });
      return {mergeVerified:true};
    },
    async cancel(input) {
      await strapi.db.transaction(async({trx})=>{
        const flow=await read(input,trx);
        await query(FLOW).update({where:{id:flow.id},data:{consumedAt:new Date()}});
      });
      return {cancelled:true};
    },
    async confirm(input) {
      if(input.confirm!==true) throw new OAuthError('merge_consent_required',400);
      const outcome=await strapi.db.transaction(async({trx})=>{
        const flow=await read(input,trx);
        await lockUsers(trx,[flow.payload.currentId,flow.payload.otherId]);
        const accounts=await pair(flow.payload.currentId,flow.payload.otherId);
        unchanged(flow,accounts);supportedRelations();
        if(!verified(flow,accounts)) {
          if(!hasPassword(accounts.current)) throw new OAuthError('merge_verification_required',403);
          if((flow.payload.passwordAttempts || 0)>=5) throw new OAuthError('rate_limited',429);
          const valid=typeof input.password==='string' && input.password.length>0 && input.password.length<=256 && await strapi.plugin('users-permissions').service('user').validatePassword(input.password,accounts.current.password);
          if(!valid) {
            // Commit the failed-attempt counter; throwing here would roll it back.
            await query(FLOW).update({where:{id:flow.id},data:{payload:{...flow.payload,passwordAttempts:(flow.payload.passwordAttempts || 0)+1}}});
            return {error:'merge_invalid_password'};
          }
        }
        const {primary,secondary}=accounts;
        const movedOrders=await orders(secondary.id),existingOrders=await orders(primary.id);
        const secondaryIdentities=await identities(secondary.id);
        for(const order of movedOrders) await query(ORDER).update({where:{id:order.id},data:{users_permissions_user:primary.id}});
        for(const identity of secondaryIdentities) await query(IDENTITY).update({where:{id:identity.id},data:{user:primary.id}});
        const profile={resetPasswordToken:null,resetPasswordExpiresAt:null};
        for(const [field,max] of Object.entries({firstname:80,lastname:80,phone:32,billingAddress:300})) {
          if(!primary[field] && typeof secondary[field]==='string' && secondary[field].length<=max) {
            try {Object.assign(profile,profileFields({[field]:secondary[field]}));} catch { /* Invalid legacy values remain in the archived profile. */ }
          }
        }
        await query(USER).update({where:{id:primary.id},data:profile});
        await query(USER).update({where:{id:secondary.id},data:{blocked:true,mergedIntoUserId:primary.id,mergedAt:new Date(),resetPasswordToken:null,resetPasswordExpiresAt:null,confirmationToken:null}});
        if((await orders(secondary.id)).length || (await orders(primary.id)).length!==existingOrders.length+movedOrders.length || (await identities(secondary.id)).length || (await identities(primary.id)).length!==accounts.identities.length) throw new Error('Merge invariant failed');
        await query(FLOW).update({where:{id:flow.id},data:{consumedAt:new Date()}});
        return {primaryId:primary.id};
      });
      if(outcome.error) throw new OAuthError(outcome.error,401);
      return outcome;
    },
  };
}
module.exports={createAccountMerge,mergePlan};
