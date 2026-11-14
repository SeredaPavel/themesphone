'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const requireBackend = createRequire(path.join(backend, 'package.json'));
const envPath = path.join(root, '.local/auth/backend.env');
let phase = 'isolated environment';

async function main() {
  const env = requireBackend('dotenv').parse(fs.readFileSync(envPath));
  if (env.DATABASE_NAME !== 'themesphone_auth_dev' || env.DATABASE_HOST !== '127.0.0.1' || env.DATABASE_PORT !== '5434' || env.NODE_ENV !== 'development') throw Error('Refusing non-isolated database');
  const runtimePath = path.join(root, '.local/auth/runtime.json');
  if (fs.existsSync(runtimePath) && JSON.parse(fs.readFileSync(runtimePath)).mailTransport !== 'mailpit') throw Error('Use Mailpit mode');
  Object.assign(process.env, env, { ENV_PATH: envPath, HOST: '127.0.0.1', PORT: '1341', DOCUMENTATION_ENABLED: 'false',
    AUTH_CONFIGURE_EMAIL: 'false', OAUTH_ENABLED: 'false', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1026', SMTP_SECURE: 'false',
    STRAPI_TELEMETRY_DISABLED: 'true', DATABASE_POOL_MIN: '0', DATABASE_POOL_MAX: '3' });
  for (const key of ['DATABASE_URL', 'SMTP_USER', 'SMTP_PASS']) delete process.env[key];

  phase = 'database snapshot';
  const compose = ['compose', '--env-file', envPath, '-f', path.join(root, 'compose.auth.yaml'), 'exec', '-T', 'db'];
  const dump = spawnSync('docker', [...compose, 'sh', '-c', 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (dump.status !== 0 || !dump.stdout?.length) throw Error('Snapshot failed');
  const toc = spawnSync('docker', [...compose, 'pg_restore', '--list'], { input: dump.stdout, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (toc.status !== 0) throw Error('Snapshot validation failed');
  const backupDir = path.join(root, '.local/backups/download-stage');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, new Date().toISOString().replace(/[:.]/g, '-') + '.dump');
  fs.writeFileSync(backup, dump.stdout, { flag: 'wx', mode: 0o600 });
  console.log('Validated local database snapshot:', path.relative(root, backup));

  phase = 'local Strapi startup';
  const fixtureParent = path.join(root, '.local/download-integration');
  fs.mkdirSync(fixtureParent, { recursive: true });
  const fixtureDir = fs.mkdtempSync(path.join(fixtureParent, 'run-'));
  const directory = path.join(fixtureDir, 'originals'); fs.mkdirSync(directory);
  process.env.WALLPAPER_ORIGINALS_DIR = directory;
  process.chdir(backend);
  const app = requireBackend('@strapi/strapi').createStrapi({ appDir: backend, distDir: backend });
  const docs = [], uploads = [];
  let loaded = false;
  const { FILE, WALLPAPER, importOriginal } = require('../backend/src/lib/wallpaper-files');
  const source = path.join(root, '.local/uploads/android_cars_82be98873e.jpg');
  const original = fs.readFileSync(source);
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const tag = 'file-check-' + crypto.randomBytes(6).toString('hex');
  let originalUsers;
  try {
    await app.load(); loaded = true; await app.start();
    originalUsers = await app.db.query('plugin::users-permissions.user').count();
    process.env.STRAPI_API_URL = 'http://127.0.0.1:1341';
    const { download } = await import(pathToFileURL(path.join(root, 'frontend/src/lib/download.ts')).href);
    async function create(title, isFree, status = 'published') {
      const item = await app.documents(WALLPAPER).create({ status, data: { title: tag + title, price: isFree ? '0' : '299', isFree } });
      docs.push(item.documentId); return item;
    }
    async function importFile(item) {
      const info = await importOriginal(app, item.documentId, source, { directory, publicDirectory: app.dirs.static.public });
      const saved = await app.db.query(WALLPAPER).findOne({ where: { documentId: item.documentId, publishedAt: { $notNull: true } }, populate: ['image'] });
      uploads.push(...saved.image); return info;
    }
    const free = await create('-free', true), paid = await create('-paid', false);
    const freeFile = await importFile(free), paidFile = await importFile(paid);

    phase = 'free original over real Strapi HTTP and frontend BFF';
    const request = new Request('http://127.0.0.1:3100/api/download?file=' + freeFile.id);
    const result = await download(request);
    assert.equal(result.status, 200); const received = Buffer.from(await result.arrayBuffer());
    assert.equal(hash(received), hash(original));
    assert.equal(result.headers.get('content-length'), String(original.length));
    assert.match(result.headers.get('content-disposition'), /^attachment;/);
    const head = await download(new Request(request, { method: 'HEAD' }));
    assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);

    phase = 'public catalogue metadata and reduced preview';
    const detail = await fetch(process.env.STRAPI_API_URL + '/api/wallpapers/' + free.documentId + '?populate=image').then(async response => { assert.equal(response.status, 200); return response.json(); });
    assert.equal(detail.data.originalFile.id, freeFile.id);
    assert.doesNotMatch(JSON.stringify(detail), /storageKey|sha256|originals/);
    const preview = Buffer.from(await fetch(new URL(detail.data.image[0].url, process.env.STRAPI_API_URL)).then(response => response.arrayBuffer()));
    assert.notEqual(hash(preview), hash(original));
    const previewInfo = await requireBackend('sharp')(preview).metadata(); assert.ok(previewInfo.width <= 512 && previewInfo.height <= 1024);
    const raw = await app.db.query(FILE).findOne({ where: { documentId: freeFile.id } });
    for (const url of ['/uploads/' + raw.storageKey, '/.private/originals/' + raw.storageKey]) {
      assert.equal((await fetch(process.env.STRAPI_API_URL + url)).status, 404);
    }

    phase = 'paid, unspecified and unpublished access is denied';
    const paidResponse = await download(new Request('http://127.0.0.1:3100/api/download?file=' + paidFile.id));
    assert.equal(paidResponse.status, 403);
    const spoof = await fetch(process.env.STRAPI_API_URL + '/api/wallpaper-files/' + paidFile.id + '/download?isFree=true&paid=true');
    assert.equal(spoof.status, 403);
    const unset = await create('-unset', null);
    await assert.rejects(importOriginal(app, unset.documentId, source, { directory, publicDirectory: app.dirs.static.public }), error => error.code === 'classification_required');
    const draft = await create('-draft', true, 'draft');
    await assert.rejects(importOriginal(app, draft.documentId, source, { directory, publicDirectory: app.dirs.static.public }), error => error.code === 'wallpaper_not_found');
    await app.documents(WALLPAPER).unpublish({ documentId: free.documentId });
    assert.equal((await download(request)).status, 404);
    await app.documents(WALLPAPER).publish({ documentId: free.documentId });

    phase = 'transaction rollback after one version media link changed';
    const rollback = await create('-rollback', true);
    const beforeVersions = await app.db.query(WALLPAPER).findMany({ where: { documentId: rollback.documentId }, populate: ['image'] });
    const beforeMedia = await app.db.query('plugin::upload.file').count();
    const beforePrivate = fs.readdirSync(directory).sort();
    const baseQuery = app.db.query.bind(app.db);
    let updates = 0;
    app.db.query = uid => {
      const query = baseQuery(uid);
      return uid !== WALLPAPER ? query : { ...query, update: async input => {
        if (++updates === 2) throw Error('Injected second-version failure');
        return query.update(input);
      } };
    };
    try {
      await assert.rejects(importOriginal(app, rollback.documentId, source, { directory, publicDirectory: app.dirs.static.public }), /Injected second-version failure/);
    } finally { app.db.query = baseQuery; }
    assert.equal(updates, 2);
    assert.equal(await app.db.query(FILE).findOne({ where: { wallpaperDocumentId: rollback.documentId } }), null);
    const versions = await app.db.query(WALLPAPER).findMany({ where: { documentId: rollback.documentId }, populate: ['image'] });
    assert.ok(versions.length >= 2);
    assert.deepEqual(versions.sort((a, b) => a.id - b.id), beforeVersions.sort((a, b) => a.id - b.id));
    assert.equal(await app.db.query('plugin::upload.file').count(), beforeMedia);
    assert.deepEqual(fs.readdirSync(directory).sort(), beforePrivate);

    phase = 'damaged original and legacy proxy rejection';
    fs.appendFileSync(path.join(directory, raw.storageKey), 'changed');
    assert.equal((await download(request)).status, 404);
    assert.equal((await download(new Request('http://127.0.0.1:3100/api/download?url=http://127.0.0.1/admin'))).status, 400);
    console.log(JSON.stringify({ pass: true, freeFileBytes: received.length, sha256Matches: true, preview: { width: previewInfo.width, height: previewInfo.height },
      paidDenied: true, unspecifiedDenied: true, draftDenied: true, unpublishedDenied: true, privatePathDenied: true, damagedFileDenied: true, transactionRollback: true, productionUntouched: true }, null, 2));
  } catch (error) {
    error.fileCheckPhase = phase;
    throw error;
  } finally {
    phase = 'fixture cleanup';
    if (loaded) {
      await app.db.query(FILE).deleteMany({ where: { wallpaperDocumentId: { $in: docs } } });
      for (const documentId of docs) await app.documents(WALLPAPER).delete({ documentId });
      for (const media of uploads) await app.plugin('upload').service('upload').remove(media);
      if (originalUsers !== undefined) assert.equal(await app.db.query('plugin::users-permissions.user').count(), originalUsers);
    }
    await app.destroy();
    assert.ok(path.resolve(fixtureDir).startsWith(path.resolve(fixtureParent) + path.sep) && path.basename(fixtureDir).startsWith('run-'));
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error('Local file check failed in ' + (error.fileCheckPhase || phase) + ' (' + (error.code || error.name) + ')');
  if (error.name === 'TypeError' || error.name === 'AssertionError') console.error(error.stack);
  process.exitCode = 1;
});
