'use strict';
const admin = require('../../lib/originals-admin');
module.exports = {
  register({ strapi }) { admin.registerRoutes(strapi); },
  async bootstrap({ strapi }) { await admin.registerPermissions(strapi); },
};
