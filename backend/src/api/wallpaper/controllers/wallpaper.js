'use strict';

/**
 * wallpaper controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

const { withOriginalFiles } = require('../../../lib/wallpaper-files');

module.exports = createCoreController('api::wallpaper.wallpaper', ({ strapi }) => ({
  async find(ctx) {
    const result = await super.find(ctx);
    if (ctx.query.status !== 'draft') result.data = await withOriginalFiles(strapi, result.data);
    return result;
  },
  async findOne(ctx) {
    const result = await super.findOne(ctx);
    if (ctx.query.status !== 'draft') result.data = await withOriginalFiles(strapi, result.data);
    return result;
  },
}));
