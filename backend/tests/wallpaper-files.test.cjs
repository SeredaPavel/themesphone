const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const files = require('../src/lib/wallpaper-files');

let root, publicDirectory, directory;
const asset = { documentId: 'original123', wallpaperDocumentId: 'wallpaper123', ready: true,
  mime: 'image/jpeg', bytes: '8', width: 736, height: 1449, storageKey: 'a'.repeat(32) + '.jpg', sha256: 'secret-digest' };
const options = () => ({ directory, publicDirectory });
const code = (promise, expected) => assert.rejects(promise, error => error.code === expected);
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'themesphone-files-test-'));
  publicDirectory = path.join(root, 'public'); directory = path.join(root, 'private');
  await fs.mkdir(publicDirectory); await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, asset.storageKey), Buffer.from('original'));
});
after(async () => {
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(root).startsWith('themesphone-files-test-'));
  await fs.rm(root, { recursive: true, force: true });
});

function service(free, file = asset) {
  return { db: { query: uid => { assert.equal(uid, files.FILE); return { findOne: async () => file }; } },
    documents: uid => { assert.equal(uid, files.WALLPAPER); return { findOne: async query => {
      assert.equal(query.status, 'published'); assert.equal(query.documentId, asset.wallpaperDocumentId);
      return free === 'missing' ? null : { title: 'Золотая осень', isFree: free };
    } }; } };
}

test('only explicit free:true on a published wallpaper grants access', async () => {
  for (const value of [false, null, undefined, 'true', 1]) await code(files.downloadOriginal(service(value), asset.documentId, options()), 'payment_required');
  await code(files.downloadOriginal(service('missing'), asset.documentId, options()), 'file_unavailable');
  const result = await files.downloadOriginal(service(true), asset.documentId, options());
  try { assert.equal((await result.handle.readFile()).toString(), 'original'); assert.equal(result.info.bytes, 8); }
  finally { await result.handle.close(); }
});

test('IDs and storage keys cannot become file paths or URLs', async () => {
  for (const id of ['', '../secret', 'https://evil.test/file', 'a'.repeat(65)]) await code(files.downloadOriginal(service(true), id, options()), 'invalid_file');
  for (const storageKey of ['../outside.jpg', '/etc/passwd', 'http://evil.test/image.jpg', 'b'.repeat(32) + '.png']) {
    await code(files.openOriginal({ ...asset, storageKey }, options()), 'file_unavailable');
  }
  await code(files.privateRoot(publicDirectory, publicDirectory), 'unsafe_storage');
  await code(files.privateRoot(path.join(publicDirectory, 'originals'), publicDirectory, true), 'unsafe_storage');
  await code(files.privateRoot('', publicDirectory), 'storage_unavailable');
});

test('a missing, changed or oversized file is never streamed', async () => {
  await code(files.openOriginal({ ...asset, storageKey: 'b'.repeat(32) + '.jpg' }, options()), 'file_unavailable');
  await code(files.openOriginal({ ...asset, bytes: '7' }, options()), 'file_unavailable');
  assert.equal(files.metadata({ ...asset, bytes: String(files.MAX_BYTES + 1) }), null);
  assert.equal(files.metadata({ ...asset, ready: 'true' }), null);
  assert.equal(files.metadata({ ...asset, documentId: undefined }), null);
});

test('a private directory cannot resolve into the public tree through a symlink', async () => {
  const link = path.join(root, 'public-link');
  await fs.symlink(publicDirectory, link, 'junction');
  await code(files.privateRoot(link, publicDirectory), 'unsafe_storage');
});

test('attachment names support Cyrillic without paths or header injection', () => {
  const value = files.disposition('Осень\r\nX-Evil: yes/../car', 'original123', 'image/jpeg');
  assert.match(value, /^attachment; filename="themesphone-original123.jpg"; filename\*=UTF-8''/);
  assert.ok(value.includes('%D0%9E')); assert.ok(!/[\r\n]/.test(value));
  assert.ok(!value.includes('/')); assert.match(files.disposition('CON', 'original123', 'image/png'), /ThemesPhone.png$/);
  assert.doesNotThrow(() => files.disposition('a'.repeat(99) + '🌌', 'original123', 'image/jpeg'));
});

test('public metadata never contains storage keys, checksums or filesystem paths', async () => {
  const api = { db: { query: () => ({ findMany: async () => [asset] }) } };
  const result = await files.withOriginalFiles(api, [{ documentId: asset.wallpaperDocumentId, title: 'Обои' }]);
  assert.deepEqual(result[0].originalFile, { id: asset.documentId, mime: 'image/jpeg', bytes: 8, width: 736, height: 1449 });
  assert.doesNotMatch(JSON.stringify(result), /storageKey|sha256|secret-digest/);
});

test('import keeps original bytes private and sends only a resized preview to Strapi', async () => {
  const source = path.join(root, 'source.jpg');
  const original = await sharp({ create: { width: 736, height: 1449, channels: 3, background: '#17616a' } }).jpeg().toBuffer();
  await fs.writeFile(source, original);
  const changed = [];
  let created, uploaded;
  const api = {
    db: { transaction: async action => action(), query: uid => uid === files.FILE
      ? { findOne: async () => null }
      : { findMany: async () => [{ id: 3 }, { id: 4 }], update: async input => { changed.push(input); } } },
    documents: uid => uid === files.WALLPAPER
      ? { findOne: async () => ({ documentId: 'import123', title: 'Исходник', isFree: false }) }
      : { create: async ({ data }) => { created = { documentId: 'newfile123', ...data }; return created; } },
    plugin: () => ({ service: () => ({ upload: async input => {
      uploaded = await fs.readFile(input.files.filepath);
      const info = await sharp(uploaded).metadata();
      assert.ok(info.width <= 512 && info.height <= 1024);
      assert.equal(input.files.mimetype, 'image/jpeg'); return [{ id: 81 }];
    }, remove: async () => { throw Error('Unexpected removal'); } }) }),
  };
  const result = await files.importOriginal(api, 'import123', source, options());
  const privateBytes = await fs.readFile(path.join(directory, created.storageKey));
  assert.deepEqual(privateBytes, original); assert.notDeepEqual(uploaded, original);
  assert.equal(created.sha256, crypto.createHash('sha256').update(original).digest('hex'));
  assert.equal(result.id, 'newfile123');
  assert.deepEqual(changed.map(item => item.where.id), [3, 4]);
  assert.deepEqual(changed.map(item => item.data), [{ image: [81] }, { image: [81] }]);
  assert.equal((await fs.readdir(directory)).some(name => name.startsWith('preview-')), false);
});

test('a failed database registration removes only the new private file and preview', async () => {
  const source = path.join(root, 'rollback.jpg');
  await fs.writeFile(source, await sharp({ create: { width: 32, height: 64, channels: 3, background: '#17616a' } }).jpeg().toBuffer());
  const before = await fs.readdir(directory);
  let removed = false;
  const api = {
    db: { query: () => ({ findOne: async () => null }), transaction: async action => action() },
    documents: uid => uid === files.WALLPAPER
      ? { findOne: async () => ({ title: 'Rollback fixture', isFree: true }) }
      : { create: async () => { throw Error('Database fixture failure'); } },
    plugin: () => ({ service: () => ({ upload: async () => [{ id: 82 }], remove: async media => { assert.equal(media.id, 82); removed = true; } }) }),
  };
  await assert.rejects(files.importOriginal(api, 'rollback123', source, options()), /Database fixture failure/);
  assert.equal(removed, true);
  assert.deepEqual(await fs.readdir(directory), before);
  assert.ok((await fs.stat(source)).isFile());
});

test('an original already under public cannot be imported as protected content', async () => {
  const source = path.join(publicDirectory, 'unsafe.jpg');
  await fs.writeFile(source, 'public source');
  const api = { db: { query: () => ({ findOne: async () => null }) },
    documents: () => ({ findOne: async () => ({ title: 'Unsafe original', isFree: false }) }) };
  await code(files.importOriginal(api, 'unsafe123', source, options()), 'public_source_forbidden');
});

test('draft upload cannot expose a paid original through an older free published version', async () => {
  const api = { documents: () => ({ findOne: async ({ status }) => ({ title: 'Changed classification', isFree: status === 'published' }) }) };
  await code(files.importOriginal(api, 'changed123', '/unused', { allowDraft: true }), 'classification_mismatch');
});

test('S3 is contacted only after published/free access checks; HEAD never signs a GET URL', async () => {
  let calls = 0;
  const objectStorage = { signedDownload: async (input, attachment, method) => {
    calls++; assert.equal(input.storageKey, asset.storageKey); assert.match(attachment, /^attachment;/);
    return method === 'HEAD' ? null : 'https://storage.yandexcloud.net/private/originals/file.jpg';
  } };
  const remote = { ...asset, storageProvider: 's3' };
  for (const free of [false, null, 'missing']) await assert.rejects(files.downloadOriginal(service(free, remote), asset.documentId, { objectStorage }));
  assert.equal(calls, 0);
  const result = await files.downloadOriginal(service(true, remote), asset.documentId, { objectStorage });
  assert.equal(result.remote, true); assert.ok(result.redirect); assert.equal(result.handle, undefined);
  assert.equal((await files.downloadOriginal(service(true, remote), asset.documentId, { objectStorage, method: 'HEAD' })).redirect, null);
  assert.equal(calls, 2);
});

test('a failed S3 import removes its own object version and never submits the original to public media', async () => {
  const source = path.join(root, 's3-rollback.jpg');
  const original = await sharp({ create: { width: 736, height: 1449, channels: 3, background: '#12545a' } }).jpeg().toBuffer();
  await fs.writeFile(source, original);
  let storedKey, removed = false, mediaRemoved = false;
  const objectStorage = {
    put: async (key, bytes) => { storedKey = key; assert.deepEqual(bytes, original); return { storageProvider: 's3', storageVersion: 'v1' }; },
    check: async () => {}, assertPrivate: async key => assert.equal(key, storedKey),
    remove: async (key, version) => { assert.equal(key, storedKey); assert.equal(version, 'v1'); removed = true; },
  };
  const api = {
    db: { query: () => ({ findOne: async () => null }), transaction: async action => action() },
    documents: uid => uid === files.WALLPAPER ? { findOne: async () => ({ title: 'S3 fixture', isFree: false }) }
      : { create: async () => { throw Error('S3 database failure'); } },
    plugin: () => ({ service: () => ({ upload: async input => {
      const preview = await fs.readFile(input.files.filepath);
      assert.notDeepEqual(preview, original); assert.ok((await sharp(preview).metadata()).width <= 512);
      return [{ id: 83 }];
    }, remove: async () => { mediaRemoved = true; } }) }),
  };
  await assert.rejects(files.importOriginal(api, 's3rollback123', source, { ...options(), storageDriver: 's3', objectStorage }), /S3 database failure/);
  assert.equal(removed, true); assert.equal(mediaRemoved, true); assert.ok((await fs.stat(source)).isFile());
});
