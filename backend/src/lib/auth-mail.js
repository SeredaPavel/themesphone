'use strict';
function plainText(html) {
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi,'')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,(_m,url,label)=>`${label} (${url})`)
    .replace(/<\/(p|h1|div)>|<br\s*\/?>/gi,'\n\n').replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\n{3,}/g,'\n\n').trim();
}
function installPlainText(strapi) {
  const service=strapi.plugin('email').service('email');
  const send=service.send.bind(service);
  service.send=options=>send(options.html && (!options.text || options.text===options.html) ? {...options,text:plainText(options.html)} : options);
}
const emailFrame=(title,text,link,button,footer)=>`<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body style="margin:0;background:#edf4f3;font-family:Arial,sans-serif;color:#13494f"><div style="max-width:560px;margin:24px auto;padding:32px;background:#ffffff;border:1px solid #d6e2e3;border-radius:24px"><p style="font-size:18px">ThemesPhone</p><h1 style="font-size:26px;font-weight:400">${title}</h1><p style="line-height:1.7">${text}</p><p style="margin:28px 0"><a href="${link}" style="display:inline-block;padding:12px 22px;background:#e97070;color:white;text-decoration:none;border-radius:28px">${button}</a></p><p style="font-size:13px;line-height:1.7;color:#6d8387">${footer}</p><p style="font-size:13px;line-height:1.7">Если кнопка не работает, откройте эту ссылку:<br><a href="${link}">${link}</a></p></div></body></html>`;
function emailSettings(frontendUrl,senderAddress) {
  const url=new URL(frontendUrl);
  if(!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname!=='/') throw Error('Invalid frontend URL');
  if(url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw Error('HTTPS is required for public email links');
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(senderAddress)) throw Error('Invalid sender address');
  const frame=emailFrame;
  return {
    confirmationRedirect:url.origin+'/confirmation/submit', resetUrl:url.origin+'/auth/reset-password',
    confirmation:{from:{name:'ThemesPhone',email:senderAddress},response_email:senderAddress,
      object:'Подтверждение регистрации в ThemesPhone',
      message:frame('Подтвердите вашу почту','Вы указали этот email при регистрации в ThemesPhone. Подтвердите адрес, чтобы войти в личный кабинет.',url.origin+'/auth/confirm-email?confirmation=<%= CODE %>','Подтвердить почту','Если вы не регистрировались, просто проигнорируйте это письмо.')},
    reset:{from:{name:'ThemesPhone',email:senderAddress},response_email:senderAddress,
      object:'Восстановление пароля ThemesPhone',
      message:frame('Задайте новый пароль','Мы получили запрос на восстановление доступа к вашему аккаунту ThemesPhone. Ссылка действует один час и может быть использована только один раз.','<%= URL %>?code=<%= TOKEN %>','Задать новый пароль','Если вы не запрашивали восстановление, ничего делать не нужно. Ваш пароль остаётся прежним.')},
  };
}
async function configureEmailAuth(strapi) {
  if(process.env.AUTH_CONFIGURE_EMAIL!=='true') return;
  const frontendUrl=process.env.AUTH_FRONTEND_URL;
  if(!frontendUrl || (process.env.NODE_ENV==='production' && !frontendUrl.startsWith('https://'))) throw Error('AUTH_FRONTEND_URL must be an explicit HTTPS URL in production');
  if(!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw Error('SMTP configuration is required before enabling email authentication');
  const settings=emailSettings(frontendUrl,process.env.SMTP_USER);
  installPlainText(strapi);
  const store=strapi.store({type:'plugin',name:'users-permissions'});
  const advanced=await store.get({key:'advanced'});
  const emails=await store.get({key:'email'});
  const grant=await store.get({key:'grant'});
  await store.set({key:'advanced',value:{...advanced,allow_register:true,unique_email:true,email_confirmation:true,default_role:'authenticated',email_confirmation_redirection:settings.confirmationRedirect,email_reset_password:settings.resetUrl}});
  emails.email_confirmation.options=settings.confirmation;
  emails.reset_password.options=settings.reset;
  await store.set({key:'email',value:emails});
  for(const [provider,config] of Object.entries(grant)) config.enabled=provider==='email';
  await store.set({key:'grant',value:grant});
  for(const role of await strapi.db.query('plugin::users-permissions.role').findMany({where:{type:{$in:['public','authenticated']}}})) {
    await strapi.db.query('plugin::users-permissions.permission').deleteMany({where:{role:role.id,action:{$in:['plugin::users-permissions.user.find','plugin::users-permissions.user.findOne','plugin::users-permissions.user.count','plugin::users-permissions.user.create','plugin::users-permissions.user.update','plugin::users-permissions.user.destroy']}}});
    if(role.type==='authenticated') for(const action of ['plugin::users-permissions.user.me','plugin::users-permissions.auth.changePassword','api::account.account.updateProfile']) {
      if(!await strapi.db.query('plugin::users-permissions.permission').findOne({where:{action,role:role.id}})) await strapi.db.query('plugin::users-permissions.permission').create({data:{action,role:role.id}});
    }
  }
  strapi.log.info('ThemesPhone email authentication settings applied (credentials are not logged).');
}
module.exports={emailSettings,configureEmailAuth,plainText,installPlainText,emailFrame};
