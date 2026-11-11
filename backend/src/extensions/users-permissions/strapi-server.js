'use strict';
// Keep the stock login and password validation. Add a bounded lifetime to reset links.
function extendAuth(controller) {
  const forgot = controller.forgotPassword;
  const reset = controller.resetPassword;
  const change = controller.changePassword;
  return {...controller, forgotPassword: async ctx => {
    await forgot(ctx);
    const email = ctx.request.body?.email;
    if (typeof email !== 'string' || ctx.status >= 400) return;
    const user = await strapi.db.query('plugin::users-permissions.user').findOne({where:{email:email.toLowerCase(),blocked:false}});
    if (user?.resetPasswordToken) await strapi.db.query('plugin::users-permissions.user').update({where:{id:user.id},data:{resetPasswordExpiresAt:new Date(Date.now()+60*60*1000)}});
  }, resetPassword: async ctx => {
    const code = ctx.request.body?.code;
    if (typeof code !== 'string' || !/^[a-f0-9]{128}$/.test(code)) return ctx.badRequest('Invalid reset link');
    return strapi.db.transaction(async ({trx}) => {
      const model = strapi.db.metadata.get('plugin::users-permissions.user');
      // Row locking makes concurrent submissions of one link single-use as well.
      const row = await trx(model.tableName).where(model.attributes.resetPasswordToken.columnName,code).forUpdate().first();
      if (!row) return ctx.badRequest('Invalid reset link');
      const user = await strapi.db.query('plugin::users-permissions.user').findOne({where:{resetPasswordToken:code}});
      if (!user || user.blocked || !user.resetPasswordExpiresAt || new Date(user.resetPasswordExpiresAt).getTime() <= Date.now()) return ctx.badRequest('Invalid reset link');
      await reset(ctx);
      await strapi.db.query('plugin::users-permissions.user').update({where:{id:user.id},data:{resetPasswordExpiresAt:null}});
      ctx.send({ok:true});
    });
  }, changePassword: async ctx => {
    if (!ctx.state.user) return change(ctx);
    return strapi.db.transaction(async ({trx}) => {
      const model=strapi.db.metadata.get('plugin::users-permissions.user');
      await trx(model.tableName).where('id',ctx.state.user.id).forUpdate().first();
      await change(ctx);
      // A password changed from the account also cancels previously mailed links.
      await strapi.db.query('plugin::users-permissions.user').update({where:{id:ctx.state.user.id},data:{resetPasswordToken:null,resetPasswordExpiresAt:null}});
    });
  }};
}
module.exports = plugin => {
  const original = plugin.controllers.auth;
  plugin.controllers.auth = typeof original === 'function'
    ? (...args) => extendAuth(original(...args))
    : extendAuth(original);
  const routes=plugin.routes?.['content-api']?.routes || [];
  for(const route of routes) if(route.handler==='auth.sendEmailConfirmation') {
    route.config ||= {};
    route.config.middlewares ||= [];
    if(!route.config.middlewares.includes('plugin::users-permissions.rateLimit')) route.config.middlewares.push('plugin::users-permissions.rateLimit');
  }
  return plugin;
};
