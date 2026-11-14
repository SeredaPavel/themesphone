'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..'), backend = path.join(root, 'backend');
const req = createRequire(path.join(backend, 'package.json'));
let phase = 'configuration';

async function main() {
  const envPath = path.join(root, '.local/auth/backend.env');
  const env = req('dotenv').parse(fs.readFileSync(envPath));
  if (env.DATABASE_NAME !== 'themesphone_auth_dev' || env.DATABASE_HOST !== '127.0.0.1' || env.DATABASE_PORT !== '5434' || env.NODE_ENV !== 'development') throw Error('Isolated database required');
  Object.assign(process.env, env, { ENV_PATH: envPath, HOST: '127.0.0.1', PORT: '1342', OAUTH_ENABLED: 'false', AUTH_CONFIGURE_EMAIL: 'false',
    DOCUMENTATION_ENABLED: 'false', STRAPI_TELEMETRY_DISABLED: 'true', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1026', SMTP_SECURE: 'false',
    DATABASE_POOL_MIN: '0', DATABASE_POOL_MAX: '3' });
  for (const key of ['DATABASE_URL', 'SMTP_USER', 'SMTP_PASS']) delete process.env[key];
  const storageEnv = req('dotenv').parse(fs.readFileSync(path.join(root, '.local/storage/backend.env')));
  for (const key of Object.keys(storageEnv).filter(key => key.startsWith('S3_') || key === 'WALLPAPER_STORAGE_DRIVER')) process.env[key] = storageEnv[key];
  const { createObjectStorage } = require('../backend/src/lib/object-storage');
  const storage = createObjectStorage();
  phase = 'database snapshot';
  const db = ['compose', '--env-file', envPath, '-f', path.join(root, 'compose.auth.yaml'), 'exec', '-T', 'db'];
  const dump = spawnSync('docker', [...db, 'sh', '-c', 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (dump.status !== 0 || !dump.stdout?.length || spawnSync('docker', [...db, 'pg_restore', '--list'], { input: dump.stdout, windowsHide: true }).status !== 0) throw Error('Snapshot failed');
  const backupDir = path.join(root, '.local/backups/download-stage'); fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'admin-s3-' + new Date().toISOString().replace(/[:.]/g, '-') + '.dump'), dump.stdout, { flag: 'wx', mode: 0o600 });
  process.chdir(backend);
  const app = req('@strapi/strapi').createStrapi({ appDir: backend, distDir: backend });
  const { WALLPAPER, FILE } = require('../backend/src/lib/wallpaper-files');
  const docs = [], admins = [], media = [];
  const tag = 's3-admin-check-' + crypto.randomBytes(6).toString('hex');
  let loaded = false;
  try {
    phase = 'Strapi startup'; await app.load(); loaded = true; await app.start();
    const originalUsers = await app.db.query('plugin::users-permissions.user').count();
    const role = await app.db.query('admin::role').findOne({ where: { code: 'strapi-super-admin' } });
    assert.ok(role);
    for (const [index, roles] of [[0, [role.id]], [1, []]]) {
      const user = await app.service('admin::user').create({ firstname: 'S3 test', lastname: tag, email: `${tag}-${index}@themesphone.test`,
        password: crypto.randomBytes(24).toString('hex'), isActive: true, roles }); admins.push(user);
    }
    const jwt = app.service('admin::token').createJwtToken(admins[0]);
    const limited = app.service('admin::token').createJwtToken(admins[1]);
    const origin = 'http://127.0.0.1:1342';
    const call = (url, options = {}, token = jwt) => fetch(origin + url, { ...options, redirect: 'manual',
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers } });
    phase = 'admin permissions';
    assert.equal((await call('/wallpaper-originals', {}, '')).status, 401);
    assert.equal((await call('/wallpaper-originals', {}, limited)).status, 403);
    const contentToken = req('jsonwebtoken').sign({ id: admins[0].id }, process.env.JWT_SECRET);
    assert.equal((await call('/wallpaper-originals', {}, contentToken)).status, 401);
    assert.equal((await call('/wallpaper-originals?page=-1')).status, 400);
    for (const isFree of [true, false]) {
      const item = await app.documents(WALLPAPER).create({ status: 'draft', data: { title: `${tag}-${isFree ? 'free' : 'paid'}`, isFree, price: isFree ? '0' : '299' } }); docs.push(item.documentId);
    }
    const bytes = await req('sharp')({ create: { width: 736, height: 1449, channels: 3, background: '#12545a' } }).jpeg().toBuffer();
    const form = (contents = bytes) => { const body = new FormData(); body.append('files', new Blob([contents], { type: 'image/jpeg' }), 'test.jpg'); return body; };
    phase = 'upload validation';
    assert.equal((await call('/api/wallpapers?status=draft', {}, '')).status, 400);
    assert.equal((await call('/api/wallpapers/' + docs[0], {}, '')).status, 404);
    assert.equal((await call('/api/wallpapers/missingS3CheckDocument', {}, '')).status, 404);
    assert.equal((await call('/api/wallpapers/' + docs[0] + '?status=draft', {}, '')).status, 400);
    assert.equal((await call('/wallpaper-originals/' + docs[1], { method: 'POST', body: form(Buffer.from('invalid image')) })).status, 400);
    assert.equal(await app.db.query(FILE).findOne({ where: { wallpaperDocumentId: docs[1] } }), null);
    phase = 'real S3 upload through admin HTTP';
    for (const documentId of docs) {
      const response = await call('/wallpaper-originals/' + documentId, { method: 'POST', body: form() });
      assert.equal(response.status, 201); const data = await response.json();
      assert.doesNotMatch(JSON.stringify(data), /storageKey|storageBucket|sha256|X-Amz/);
      const item = await app.documents(WALLPAPER).findOne({ documentId, status: 'draft', populate: ['image'] }); media.push(...item.image);
      assert.equal(await app.documents(WALLPAPER).findOne({ documentId, status: 'published' }), null);
      const file = await app.db.query(FILE).findOne({ where: { wallpaperDocumentId: documentId } });
      await storage.assertPrivate(file.storageKey);
      assert.equal((await call('/api/wallpaper-files/' + file.documentId + '/download', {}, '')).status, 404);
    }
    assert.equal((await call('/wallpaper-originals/' + docs[0], { method: 'POST', body: form() })).status, 409);
    const list = await call('/wallpaper-originals?search=' + tag).then(response => response.json());
    assert.equal(list.total, 2); assert.ok(list.data.every(item => item.hasOriginal && item.original && !item.published));
    phase = 'publication and native download';
    for (const documentId of docs) await app.documents(WALLPAPER).publish({ documentId });
    const free = await app.db.query(FILE).findOne({ where: { wallpaperDocumentId: docs[0] } });
    const paid = await app.db.query(FILE).findOne({ where: { wallpaperDocumentId: docs[1] } });
    process.env.STRAPI_API_URL = origin;
    const { download } = await import(pathToFileURL(path.join(root, 'frontend/src/lib/download.ts')).href);
    const request = new Request('http://127.0.0.1:3100/api/download?file=' + free.documentId);
    const result = await download(request); assert.equal(result.status, 302);
    const file = await fetch(result.headers.get('location'), { redirect: 'manual' });
    assert.equal(file.status, 200); assert.match(file.headers.get('content-disposition'), /^attachment;/);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    const head = await download(new Request(request, { method: 'HEAD' })); assert.equal(head.status, 200); assert.equal(head.headers.get('location'), null);
    assert.equal((await download(new Request('http://127.0.0.1:3100/api/download?file=' + paid.documentId))).status, 403);
    const detail = await call('/api/wallpapers/' + docs[0] + '?populate=image', {}, '').then(response => response.json());
    assert.ok(detail.data.originalFile); assert.doesNotMatch(JSON.stringify(detail), /storageKey|storageBucket|sha256|X-Amz/);
    const preview = await fetch(detail.data.image[0].url); assert.equal(preview.status, 200);
    const dimensions = await req('sharp')(Buffer.from(await preview.arrayBuffer())).metadata();
    assert.ok(dimensions.width <= 512 && dimensions.height <= 1024);
    await app.documents(WALLPAPER).unpublish({ documentId: docs[0] }); assert.equal((await download(request)).status, 404);
    assert.equal(await app.db.query('plugin::users-permissions.user').count(), originalUsers);
    console.log(JSON.stringify({ pass: true, adminAuthentication: true, adminPermissions: true, draftUpload: true, noImplicitPublication: true,
      publicDraftsDenied: true, invalidImageDenied: true, duplicateDenied: true, privateOriginals: true, freeSignedDownload: true, paidDenied: true, publicPreview: true, unpublishedDenied: true }));
  } finally {
    if (loaded) {
      const originals = docs.length ? await app.db.query(FILE).findMany({ where: { wallpaperDocumentId: { $in: docs } } }) : [];
      for (const file of originals) await storage.remove(file.storageKey, file.storageVersion);
      await app.db.query(FILE).deleteMany({ where: { wallpaperDocumentId: { $in: docs } } });
      for (const documentId of docs) await app.documents(WALLPAPER).delete({ documentId });
      for (const file of media) await app.plugin('upload').service('upload').remove(file);
      for (const user of admins) await app.db.query('admin::user').delete({ where: { id: user.id } });
    }
    storage.close(); await app.destroy();
    console.log('Temporary local fixtures and S3 objects removed.');
  }
}
main().catch(error => {
  console.error('Originals admin check failed in ' + phase + ': ' + (error.code || error.name));
  if (error.name === 'AssertionError' || phase === 'Strapi startup') {
    let message = String(error.message);
    for (const key of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'JWT_SECRET', 'ADMIN_JWT_SECRET', 'DATABASE_PASSWORD', 'APP_KEYS']) {
      if (process.env[key]) message = message.split(process.env[key]).join('[redacted]');
    }
    console.error(message.slice(0, 1200));
  }
  process.exitCode = 1;
});
