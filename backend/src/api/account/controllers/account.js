'use strict';
const {profileFields} = require('../../../lib/profile-fields');
module.exports = {
  async updateProfile(ctx) {
    const current = ctx.state.user;
    if (!current || current.blocked || !current.confirmed) return ctx.unauthorized();
    let data;
    try { data = profileFields(ctx.request.body); } catch { return ctx.badRequest('Invalid profile fields'); }
    const user = await strapi.db.query('plugin::users-permissions.user').update({where:{id:current.id}, data});
    ctx.send({id:user.id,username:user.username,email:user.email,confirmed:user.confirmed,
      firstname:user.firstname || '', lastname:user.lastname || '', phone:user.phone || '', billingAddress:user.billingAddress || ''});
  },
};
