'use strict';
const { downloadOriginal, FileError } = require('../../../lib/wallpaper-files');

module.exports = {
  async download(ctx) {
    try {
      const file = await downloadOriginal(strapi, ctx.params.fileId, {
        directory: process.env.WALLPAPER_ORIGINALS_DIR,
        publicDirectory: strapi.dirs.static.public,
        method: ctx.method,
      });
      ctx.set('Content-Type', file.info.mime);
      ctx.set('Content-Length', String(file.info.bytes));
      ctx.set('Content-Disposition', file.disposition);
      ctx.set('Cache-Control', 'private, no-store');
      ctx.set('X-Content-Type-Options', 'nosniff');
      if (file.remote) {
        if (ctx.method === 'HEAD') { ctx.status = 200; return; }
        ctx.remove('Content-Length');
        ctx.remove('Content-Type');
        ctx.remove('Content-Disposition');
        ctx.set('Referrer-Policy', 'no-referrer');
        ctx.status = 302;
        ctx.set('Location', file.redirect);
        return;
      }
      ctx.status = 200;
      if (ctx.method === 'HEAD') { await file.handle.close(); return; }
      ctx.body = file.handle.createReadStream();
    } catch (error) {
      ctx.status = error instanceof FileError ? error.status : 503;
      ctx.set('Cache-Control', 'no-store');
      ctx.body = { error: error instanceof FileError ? error.code : 'file_unavailable' };
    }
  },
};
