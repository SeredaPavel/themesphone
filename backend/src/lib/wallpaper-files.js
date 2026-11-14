'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const FILE = 'api::wallpaper-file.wallpaper-file';
const WALLPAPER = 'api::wallpaper.wallpaper';
const MAX_BYTES = 50 * 1024 * 1024;
const ID = /^[a-zA-Z0-9]{1,64}$/;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

class FileError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

function metadata(file) {
  const bytes = Number(file?.bytes);
  if (file?.ready !== true || typeof file.documentId !== 'string' || !ID.test(file.documentId) || !EXTENSIONS[file.mime] ||
      !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_BYTES ||
      !Number.isInteger(file.width) || file.width <= 0 || !Number.isInteger(file.height) || file.height <= 0) return null;
  return { id: file.documentId, mime: file.mime, bytes, width: file.width, height: file.height };
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function privateRoot(directory, publicDirectory, create = false) {
  if (!directory || !path.isAbsolute(directory)) throw new FileError('storage_unavailable', 503);
  const resolved = path.resolve(directory);
  const publicRoot = await fs.promises.realpath(publicDirectory);
  if (isWithin(publicRoot, resolved)) throw new FileError('unsafe_storage', 503);
  if (create) await fs.promises.mkdir(resolved, { recursive: true, mode: 0o700 });
  const real = await fs.promises.realpath(resolved);
  if (isWithin(publicRoot, real)) throw new FileError('unsafe_storage', 503);
  return real;
}

function disposition(title, id, mime) {
  const extension = EXTENSIONS[mime];
  if (!extension || !ID.test(id)) throw new FileError('invalid_file', 404);
  let name = String(title || 'ThemesPhone').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ').trim().replace(/^[. ]+|[. ]+$/g, '');
  name = Array.from(name).slice(0, 100).join('').trim();
  if (!name || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) name = 'ThemesPhone';
  const encoded = encodeURIComponent(name + '.' + extension).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="themesphone-${id}.${extension}"; filename*=UTF-8''${encoded}`;
}

async function openOriginal(file, options) {
  const info = metadata(file);
  if (!info || !/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(file.storageKey) || !file.storageKey.endsWith('.' + EXTENSIONS[file.mime])) throw new FileError('file_unavailable', 404);
  let handle;
  try {
    const root = await privateRoot(options.directory, options.publicDirectory);
    const filename = path.join(root, file.storageKey);
    if ((await fs.promises.lstat(filename)).isSymbolicLink()) throw new FileError('file_unavailable', 404);
    handle = await fs.promises.open(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== info.bytes || stat.size > MAX_BYTES) throw new FileError('file_unavailable', 404);
    return { handle, info };
  } catch (error) {
    await handle?.close();
    if (error instanceof FileError) throw error;
    throw new FileError(error.code === 'ENOENT' ? 'file_unavailable' : 'storage_unavailable', error.code === 'ENOENT' ? 404 : 503);
  }
}

async function withOriginalFiles(strapi, data) {
  const items = Array.isArray(data) ? data : data ? [data] : [];
  const ids = items.map(item => item.documentId).filter(id => typeof id === 'string' && ID.test(id));
  if (!ids.length) return data;
  const files = await strapi.db.query(FILE).findMany({ where: { wallpaperDocumentId: { $in: ids }, ready: true } });
  const byWallpaper = new Map(files.map(file => [file.wallpaperDocumentId, metadata(file)]));
  const append = item => ({ ...item, originalFile: byWallpaper.get(item.documentId) || null });
  return Array.isArray(data) ? data.map(append) : append(data);
}

async function downloadOriginal(strapi, id, options) {
  if (typeof id !== 'string' || !ID.test(id)) throw new FileError('invalid_file', 400);
  const file = await strapi.db.query(FILE).findOne({ where: { documentId: id, ready: true } });
  if (!metadata(file) || !ID.test(file.wallpaperDocumentId)) throw new FileError('file_unavailable', 404);
  const wallpaper = await strapi.documents(WALLPAPER).findOne({ documentId: file.wallpaperDocumentId, status: 'published', fields: ['title', 'isFree'] });
  if (!wallpaper) throw new FileError('file_unavailable', 404);
  // Prices, sessions and legacy paid:true orders cannot grant a download here.
  // Paid entitlement will be added only with the verified order/payment model.
  if (wallpaper.isFree !== true) throw new FileError('payment_required', 403);
  const attachment = disposition(wallpaper.title, id, file.mime);
  if (file.storageProvider === 's3') {
    let storage;
    try {
      storage = options.objectStorage || require('./object-storage').createObjectStorage(options.env);
      const redirect = await storage.signedDownload(file, attachment, options.method);
      return { info: metadata(file), disposition: attachment, redirect, remote: true };
    } catch { throw new FileError('storage_unavailable', 503); }
    finally { if (!options.objectStorage) storage?.close(); }
  }
  if (file.storageProvider && file.storageProvider !== 'local') throw new FileError('storage_unavailable', 503);
  const opened = await openOriginal(file, options);
  return { ...opened, disposition: attachment };
}

async function importOriginal(strapi, documentId, source, options) {
  if (typeof documentId !== 'string' || !ID.test(documentId)) throw new FileError('invalid_wallpaper', 400);
  const wallpaper = await strapi.documents(WALLPAPER).findOne({ documentId, status: options.allowDraft ? 'draft' : 'published', fields: ['title', 'isFree'] });
  if (!wallpaper) throw new FileError('wallpaper_not_found', 404);
  if (typeof wallpaper.isFree !== 'boolean') throw new FileError('classification_required', 400);
  if (options.allowDraft) {
    const published = await strapi.documents(WALLPAPER).findOne({ documentId, status: 'published', fields: ['isFree'] });
    if (published && published.isFree !== wallpaper.isFree) throw new FileError('classification_mismatch', 409);
  }
  if (await strapi.db.query(FILE).findOne({ where: { wallpaperDocumentId: documentId } })) throw new FileError('original_already_exists', 409);
  const sourceStat = await fs.promises.lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size <= 0 || sourceStat.size > MAX_BYTES) throw new FileError('invalid_source', 400);
  if (isWithin(await fs.promises.realpath(options.publicDirectory), await fs.promises.realpath(source))) throw new FileError('public_source_forbidden', 400);
  const bytes = await fs.promises.readFile(source);
  if (bytes.length !== sourceStat.size || bytes.length > MAX_BYTES) throw new FileError('invalid_source', 400);
  const sharp = require('sharp');
  let image;
  try { image = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata(); }
  catch { throw new FileError('unsupported_image', 400); }
  const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[image.format];
  if (!mime || !image.width || !image.height || (image.pages || 1) !== 1) throw new FileError('unsupported_image', 400);
  const driver = options.storageDriver || process.env.WALLPAPER_STORAGE_DRIVER || 'local';
  if (!['local', 's3'].includes(driver)) throw new FileError('storage_unavailable', 503);
  // S3 originals never pass through Strapi's public media library.
  const storage = driver === 's3' ? options.objectStorage || require('./object-storage').createObjectStorage(options.env) : null;
  const root = driver === 's3'
    ? await fs.promises.mkdtemp(path.join(os.tmpdir(), 'themesphone-preview-'))
    : await privateRoot(options.directory, options.publicDirectory, true);
  const storageKey = crypto.randomBytes(16).toString('hex') + '.' + EXTENSIONS[mime];
  const target = path.join(root, storageKey);
  const previewPath = path.join(root, 'preview-' + crypto.randomBytes(16).toString('hex') + '.jpg');
  let preview;
  let committed = false;
  let written = false;
  let storageFields = { storageProvider: 'local' };
  try {
    if (storage) {
      written = true;
      storageFields = await storage.put(storageKey, bytes, mime);
      await storage.check({ ...storageFields, storageKey, bytes: bytes.length, mime,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
      await storage.assertPrivate(storageKey);
    } else {
      await fs.promises.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
      written = true;
    }
    await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate()
      .resize({ width: 512, height: 1024, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#073d40' }).jpeg({ quality: 78, progressive: true }).toFile(previewPath);
    const uploaded = await strapi.plugin('upload').service('upload').upload({
      data: { fileInfo: { name: `Preview-${documentId}.jpg`, alternativeText: wallpaper.title, caption: 'Публичное уменьшенное превью ThemesPhone' } },
      files: { filepath: previewPath, originalFilename: `preview-${documentId}.jpg`, mimetype: 'image/jpeg', size: (await fs.promises.stat(previewPath)).size },
    });
    preview = uploaded[0];
    if (!preview?.id) throw new FileError('preview_unavailable', 503);
    const file = await strapi.db.transaction(async () => {
      const file = await strapi.documents(FILE).create({ data: { wallpaperDocumentId: documentId, storageKey, ...storageFields,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'), mime, bytes: String(bytes.length),
        width: image.width, height: image.height, ready: true } });
      // Update only media links on both draft/published rows; never publish other draft edits.
      const versions = await strapi.db.query(WALLPAPER).findMany({ where: { documentId }, select: ['id'] });
      for (const version of versions) await strapi.db.query(WALLPAPER).update({ where: { id: version.id }, data: { image: [preview.id] } });
      return file;
    });
    committed = true;
    return metadata(file);
  } catch (error) {
    if (!committed) {
      if (written) {
        try { if (storage) await storage.remove(storageKey, storageFields.storageVersion); else await fs.promises.unlink(target); }
        catch { strapi.log?.warn('New original cleanup failed; storage reconciliation required'); }
      }
      if (preview) await strapi.plugin('upload').service('upload').remove(preview).catch(() => strapi.log?.warn('New preview cleanup failed'));
    }
    throw error;
  } finally {
    await fs.promises.unlink(previewPath).catch(error => { if (error.code !== 'ENOENT') strapi.log?.warn('Temporary preview cleanup failed'); });
    if (storage) {
      await fs.promises.rmdir(root).catch(() => strapi.log?.warn('Temporary preview directory cleanup failed'));
      if (!options.objectStorage) storage.close();
    }
  }
}

module.exports = { FILE, WALLPAPER, MAX_BYTES, FileError, metadata, privateRoot, disposition, openOriginal, withOriginalFiles, downloadOriginal, importOriginal };
