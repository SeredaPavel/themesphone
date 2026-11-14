'use strict';

/**
 * wallpaper controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

const { withOriginalFiles } = require('../../../lib/wallpaper-files');

module.exports = createCoreController('api::wallpaper.wallpaper', ({ strapi }) => ({
  async find(ctx) {
    if (ctx.query.status && ctx.query.status !== 'published') return ctx.badRequest('Drafts are available only in the admin panel.');
    ctx.query.status = 'published';
    const result = await super.find(ctx);
    if (result?.data) result.data = await withOriginalFiles(strapi, result.data);
    return result;
  },
  async findOne(ctx) {
    if (ctx.query.status && ctx.query.status !== 'published') return ctx.badRequest('Drafts are available only in the admin panel.');
    ctx.query.status = 'published';
    const result = await super.findOne(ctx);
    if (result?.data) result.data = await withOriginalFiles(strapi, result.data);
    return result;
  },
}));
