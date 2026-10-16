// backend/src/extensions/users-permissions/strapi-server.js

'use strict';

module.exports = (plugin) => {
  plugin.controllers.auth.callback = async (ctx) => {
    const { provider } = ctx.params;
    const query = ctx.query;

    try {
      const user = await strapi
        .plugin('users-permissions')
        .service('providers-registry')
        .runCallback(provider, ctx);

      // Устанавливаем JWT в cookie и возвращаем ответ
      const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

      ctx.cookies.set('token', jwt, {
        httpOnly: false,
        secure: false,
        sameSite: 'lax',
      });

      ctx.send({
        jwt,
        user: await strapi
          .plugin('users-permissions')
          .service('user')
          .sanitizeUser(user),
      });
    } catch (err) {
      ctx.unauthorized(err.message);
    }
  };

  plugin.controllers.auth.emailConfirmation = async (ctx) => {
    const { confirmation } = ctx.request.body;

    if (!confirmation) {
      return ctx.badRequest('Missing confirmation code');
    }

    const userService = strapi.plugin('users-permissions').service('user');
    const jwtService = strapi.plugin('users-permissions').service('jwt');

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { confirmationToken: confirmation },
    });

    if (!user) {
      return ctx.badRequest('Invalid confirmation token');
    }

    await userService.edit(user.id, {
      confirmed: true,
      confirmationToken: null,
    });

    const jwt = jwtService.issue({ id: user.id });

    ctx.cookies.set('token', jwt, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
    });

    ctx.send({
      jwt,
      user: await userService.sanitizeUser(user),
    });
  };

  return plugin;
};
