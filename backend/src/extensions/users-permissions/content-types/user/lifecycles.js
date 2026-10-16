// backend/src/extensions/users-permissions/content-types/user/lifecycles.js

'use strict';

module.exports = {
  async afterCreate(event) {
    const { result } = event;

    try {
      strapi.log.info('📧 Кастомный afterCreate хук: отправка письма на', result.email);

      await strapi
        .plugin('users-permissions')
        .service('user')
        .sendConfirmationEmail(result);
    } catch (err) {
      strapi.log.error('❌ Ошибка в afterCreate (отправка email):', err);
    }
  },
};
