'use strict';
const { FILE, WALLPAPER, MAX_BYTES, FileError, metadata, importOriginal } = require('./wallpaper-files');
const ACTION = 'plugin::wallpaper-originals.manage';
let uploading = false;

function registerRoutes(strapi) {
  const policies = ['admin::isAuthenticatedAdmin', { name: 'admin::hasPermissions', config: { actions: [ACTION] } }];
  const respond = handler => async ctx => {
    ctx.set('Cache-Control', 'no-store');
    try { await handler(ctx); }
    catch (error) {
      ctx.status = error instanceof FileError ? error.status : 503;
      ctx.body = { error: { code: error instanceof FileError ? error.code : 'storage_unavailable' } };
    } finally {
      if (ctx.method === 'POST') for (const upload of Object.values(ctx.request.files || {}).flat()) {
        if (typeof upload?.filepath === 'string') await require('node:fs/promises').unlink(upload.filepath).catch(() => {});
      }
    }
  };
  strapi.server.routes({ type: 'admin', routes: [
    { method: 'GET', path: '/wallpaper-originals', config: { policies }, handler: respond(async ctx => {
      const page = Number(ctx.query.page || 1);
      const search = typeof ctx.query.search === 'string' ? ctx.query.search.trim() : '';
      if (!Number.isInteger(page) || page < 1 || page > 500 || search.length > 80 ||
          Object.keys(ctx.query).some(key => !['page', 'search'].includes(key))) throw new FileError('invalid_query', 400);
      const filters = search ? { title: { $containsi: search } } : {};
      const [items, total] = await Promise.all([
        strapi.documents(WALLPAPER).findMany({ status: 'draft', fields: ['title', 'isFree'], filters,
          sort: ['title:asc'], start: (page - 1) * 20, limit: 20 }),
        strapi.documents(WALLPAPER).count({ status: 'draft', filters }),
      ]);
      const ids = items.map(item => item.documentId);
      const originals = ids.length ? await strapi.db.query(FILE).findMany({ where: { wallpaperDocumentId: { $in: ids } } }) : [];
      const published = ids.length ? await strapi.db.query(WALLPAPER).findMany({ where: { documentId: { $in: ids }, publishedAt: { $notNull: true } }, select: ['documentId'] }) : [];
      const byId = new Map(originals.map(file => [file.wallpaperDocumentId, metadata(file)]));
      const publicIds = new Set(published.map(item => item.documentId));
      ctx.body = { data: items.map(item => ({ documentId: item.documentId, title: item.title, isFree: item.isFree,
        published: publicIds.has(item.documentId), original: byId.get(item.documentId) || null,
        hasOriginal: byId.has(item.documentId) })), page, pages: Math.max(1, Math.ceil(total / 20)), total,
        storageReady: process.env.WALLPAPER_STORAGE_DRIVER === 's3' };
    }) },
    { method: 'POST', path: '/wallpaper-originals/:documentId', config: { policies }, handler: respond(async ctx => {
      if (process.env.WALLPAPER_STORAGE_DRIVER !== 's3') throw new FileError('storage_not_configured', 503);
      const files = ctx.request.files || {};
      const file = files.files;
      if (!file || Array.isArray(file) || Object.keys(files).some(key => key !== 'files') ||
          Object.keys(ctx.request.body || {}).length || typeof file.filepath !== 'string' ||
          !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES) throw new FileError('one_image_required', 400);
      if (uploading) { ctx.set('Retry-After', '2'); throw new FileError('upload_in_progress', 429); }
      uploading = true;
      try {
        const original = await importOriginal(strapi, ctx.params.documentId, file.filepath, {
          allowDraft: true, storageDriver: 's3', publicDirectory: strapi.dirs.static.public,
        });
        ctx.status = 201;
        ctx.body = { data: original };
      } finally { uploading = false; }
    }) },
  ] });
}

async function registerPermissions(strapi) {
  await strapi.service('admin::permission').actionProvider.registerMany([
    { section: 'plugins', displayName: 'Загружать оригиналы обоев', uid: 'manage', pluginName: 'wallpaper-originals' },
  ]);
}

module.exports = { ACTION, registerRoutes, registerPermissions };
