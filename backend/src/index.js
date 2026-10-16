//src/index.js
'use strict';

module.exports = {
  /**
   * Регистрируем кастомного провайдера Yandex через providers-registry
   */
  register({ strapi }) {
    strapi
      .plugin('users-permissions')
      .service('providers-registry')
      .add('yandex', {
        icon: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Yandex_icon.svg',
        enabled: true,
        grantConfig: {
          key: process.env.YANDEX_CLIENT_ID,
          secret: process.env.YANDEX_CLIENT_SECRET,
          callback: `${strapi.config.get('server.url')}/api/auth/yandex/callback`,
          scope: ['login:email'],
          oauth: 2,
          authorize_url: 'https://oauth.yandex.com/authorize',
          access_url: 'https://oauth.yandex.com/token',
        },
        async authCallback({ access_token, providers, purest }) {
          const yandex = purest({ provider: 'yandex', config: { origin: 'https://login.yandex.ru' } });
          const { body } = await yandex.get('userinfo').auth(access_token).request();
          return {
            email: body.email,
            username: body.display_name || body.real_name || body.email,
          };
        },
      });

    strapi.log.info('✅ Yandex OAuth провайдер зарегистрирован через providers-registry');
  },

  /**
   * Можно оставить пустым или добавить инициализацию при старте
   */
  bootstrap(/*{ strapi }*/) {},
};
