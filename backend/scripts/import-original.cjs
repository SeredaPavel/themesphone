'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { createStrapi } = require('@strapi/strapi');
const { importOriginal, privateRoot, MAX_BYTES } = require('../src/lib/wallpaper-files');

async function main() {
  const args = process.argv.slice(2);
  const values = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') { values.apply = true; continue; }
    if (args[i] === '--local') { values.local = true; continue; }
    if (args[i] === '--s3') { values.s3 = true; continue; }
    if (!['--wallpaper', '--file'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || values[args[i]]) throw Error('invalid_arguments');
    values[args[i]] = args[++i];
  }
  if (!/^[a-zA-Z0-9]{1,64}$/.test(values['--wallpaper'] || '') || !values['--file']) throw Error('usage');
  const appDir = path.resolve(__dirname, '..');
  const source = path.resolve(values['--file']);
  if (values.local) {
    const envPath = path.resolve(appDir, '../.local/auth/backend.env');
    const env = require('dotenv').parse(fs.readFileSync(envPath));
    if (env.DATABASE_NAME !== 'themesphone_auth_dev' || env.DATABASE_HOST !== '127.0.0.1' || env.DATABASE_PORT !== '5434' || env.NODE_ENV !== 'development') throw Error('local_configuration_required');
    Object.assign(process.env, env, { ENV_PATH: envPath, AUTH_CONFIGURE_EMAIL: 'false', OAUTH_ENABLED: 'false', DOCUMENTATION_ENABLED: 'false', STRAPI_TELEMETRY_DISABLED: 'true' });
    for (const key of ['DATABASE_URL', 'SMTP_USER', 'SMTP_PASS']) delete process.env[key];
  } else if (process.env.NODE_ENV !== 'production' || !process.env.DATABASE_HOST || !process.env.DATABASE_NAME || process.env.DATABASE_URL ||
      (!process.env.WALLPAPER_ORIGINALS_DIR && process.env.WALLPAPER_STORAGE_DRIVER !== 's3')) {
    throw Error('explicit_environment_required');
  }
  if (values.s3) {
    if (!values.local) throw Error('s3_flag_requires_local');
    const storageEnv = require('dotenv').parse(fs.readFileSync(path.resolve(appDir, '../.local/storage/backend.env')));
    for (const key of ['WALLPAPER_STORAGE_DRIVER', 'S3_ENDPOINT', 'S3_REGION', 'S3_ORIGINALS_BUCKET',
      'S3_PREVIEWS_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_SIGNED_URL_TTL']) {
      if (storageEnv[key] !== undefined) process.env[key] = storageEnv[key];
    }
  }
  if (process.env.WALLPAPER_STORAGE_DRIVER === 's3') require('../src/lib/object-storage').storageConfig();
  process.chdir(appDir);
  const app = createStrapi({ appDir, distDir: appDir });
  try {
    await app.load();
    const options = { directory: process.env.WALLPAPER_ORIGINALS_DIR, publicDirectory: app.dirs.static.public };
    if (process.env.WALLPAPER_STORAGE_DRIVER !== 's3') await privateRoot(options.directory, options.publicDirectory);
    const stat = await fs.promises.lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_BYTES) throw Error('invalid_source');
    const image = await require('sharp')(source, { limitInputPixels: 40_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(image.format) || (image.pages || 1) !== 1) throw Error('unsupported_image');
    const item = await app.documents('api::wallpaper.wallpaper').findOne({ documentId: values['--wallpaper'], status: 'published', fields: ['title', 'isFree'] });
    if (!item || typeof item.isFree !== 'boolean') throw Error('published_classified_wallpaper_required');
    const publicRoot = await fs.promises.realpath(options.publicDirectory);
    const relative = path.relative(publicRoot, await fs.promises.realpath(source));
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('public_source_forbidden');
    if (await app.db.query('api::wallpaper-file.wallpaper-file').findOne({ where: { wallpaperDocumentId: item.documentId } })) throw Error('original_already_exists');
    if (!values.apply) {
      console.log(JSON.stringify({ mode: 'preview', storage: process.env.WALLPAPER_STORAGE_DRIVER || 'local', wallpaper: item.documentId, title: item.title, free: item.isFree, bytes: stat.size,
        action: 'Save one private original and publish only a generated preview. Existing media files are preserved.' }, null, 2));
      return;
    }
    const result = await importOriginal(app, item.documentId, source, options);
    console.log(JSON.stringify({ imported: true, wallpaper: item.documentId, original: result }, null, 2));
  } finally { await app.destroy(); }
}
main().catch(error => {
  console.error(error.message === 'usage' ? 'Usage: npm run original:import -- [--local] [--s3] --wallpaper DOCUMENT_ID --file ABSOLUTE_PATH [--apply]' : 'Import failed: ' + (error.code || 'check_configuration_and_input'));
  process.exitCode = 1;
});
