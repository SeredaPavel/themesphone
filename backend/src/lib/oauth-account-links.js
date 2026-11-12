'use strict';
const crypto=require('node:crypto');
const {OAuthError,emailLock}=require('./oauth-service');
const {digest,validOrigin}=require('./oauth-providers');
const {emailFrame,plainText}=require('./auth-mail');
const USER='plugin::users-permissions.user',FLOW='api::oauth-flow.oauth-flow';
function validEmail(value) {
  if(typeof value!=='string' || value.length<6 || value.length>254) return false;
  const parts=value.split('@');
  if(parts.length!==2) return false;
  const [local,domain]=parts,labels=domain.split('.');
  return local.length<=64 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') && labels.length>=2 && labels.every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
async function lockUser(strapi,trx,id) {
  const model=strapi.db.metadata.get(USER);
  await trx(model.tableName).where('id',id).forUpdate().first();
}
async function checkEmail(strapi,trx,user,email) {
  if(!user || user.blocked || !user.confirmed) throw new OAuthError('login_required',401);
  if(user.email && user.email!==email) throw new OAuthError('email_already_set',409);
  await emailLock(trx,email);
  const existing=await strapi.db.query(USER).findOne({where:{$or:[{email:{$eqi:email}},{username:email}],id:{$ne:user.id}}});
  if(existing) throw new OAuthError('email_in_use',409);
}
async function requestAccountLink(strapi,input,sessionUser,kind) {
  if(!validOrigin(input.origin)) throw new OAuthError('invalid_flow');
  const code=crypto.randomBytes(kind==='email'?20:64).toString('hex');
  const expiresAt=new Date(Date.now()+3600000);
  const email=await strapi.db.transaction(async({trx})=>{
    await lockUser(strapi,trx,sessionUser.id);
    const user=await strapi.db.query(USER).findOne({where:{id:sessionUser.id}});
    if(!user || user.blocked || !user.confirmed) throw new OAuthError('login_required',401);
    if(kind==='email' && user.email) throw new OAuthError('email_already_set',409);
    if(kind==='password' && user.password) throw new OAuthError('password_exists',409);
    const target=user.email || (typeof input.email==='string'?input.email.trim().toLowerCase():'');
    if(!validEmail(target)) throw new OAuthError('invalid_email');
    await checkEmail(strapi,trx,user,target);
    await strapi.db.query(FLOW).create({data:{key:digest(code),payload:{stage:kind==='email'?'email-attach':'password-setup',userId:user.id,email:target},expiresAt}});
    if(kind==='password') await strapi.db.query(USER).update({where:{id:user.id},data:{resetPasswordToken:code,resetPasswordExpiresAt:expiresAt}});
    return target;
  });
  const link=new URL(kind==='email'?'/auth/confirm-email':'/auth/reset-password',input.origin);
  link.searchParams.set(kind==='email'?'confirmation':'code',code);
  link.searchParams.set(kind==='password'?'setup':'account','1');
  const title=kind==='email'?'Подтвердите вашу почту':'Создайте пароль';
  const text=kind==='email'?'Подтвердите адрес, который вы добавили в личном кабинете ThemesPhone.':'По этой ссылке можно создать пароль для входа в ваш аккаунт ThemesPhone по email. Подключённые сервисы останутся доступны.';
  const html=emailFrame(title,text+' Ссылка действует один час и может быть использована только один раз.',link.href.replace(/&/g,'&amp;'),kind==='email'?'Подтвердить почту':'Создать пароль','Если вы не запрашивали это письмо, ничего делать не нужно.');
  await strapi.plugin('email').service('email').send({to:{address:email},subject:kind==='email'?'Подтверждение почты ThemesPhone':'Создание пароля ThemesPhone',html,text:plainText(html)});
  return {mailSent:true};
}
async function lockedFlow(strapi,trx,code,stage) {
  const key=digest(code);
  const model=strapi.db.metadata.get(FLOW);
  await trx(model.tableName).where(model.attributes.key.columnName,key).forUpdate().first();
  const flow=await strapi.db.query(FLOW).findOne({where:{key}});
  if(!flow || flow.payload.stage!==stage) return null;
  if(flow.consumedAt || new Date(flow.expiresAt).getTime()<=Date.now()) throw new OAuthError('invalid_flow');
  return flow;
}
async function confirmAccountEmail(strapi,code) {
  const existing=await strapi.db.query(FLOW).findOne({where:{key:digest(code)}});
  if(!existing || existing.payload.stage!=='email-attach') return false;
  await strapi.db.transaction(async({trx})=>{
    const flow=await lockedFlow(strapi,trx,code,'email-attach');
    if(!flow) throw new OAuthError('invalid_flow');
    await lockUser(strapi,trx,flow.payload.userId);
    const user=await strapi.db.query(USER).findOne({where:{id:flow.payload.userId}});
    await checkEmail(strapi,trx,user,flow.payload.email);
    await strapi.db.query(USER).update({where:{id:user.id},data:{email:flow.payload.email}});
    await strapi.db.query(FLOW).update({where:{id:flow.id},data:{consumedAt:new Date()}});
  });
  return true;
}
async function passwordSetup(strapi,trx,user,code) {
  const flow=await lockedFlow(strapi,trx,code,'password-setup');
  if(!flow) return null;
  if(flow.payload.userId!==user.id) throw new OAuthError('invalid_flow');
  await checkEmail(strapi,trx,user,flow.payload.email);
  return flow;
}
module.exports={requestAccountLink,confirmAccountEmail,passwordSetup};
