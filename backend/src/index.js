'use strict';
module.exports = {
  async bootstrap({strapi}) {
    await require('./lib/auth-mail').configureEmailAuth(strapi);
  },
};
