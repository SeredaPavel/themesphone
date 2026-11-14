const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { storageConfig, createObjectStorage } = require('../src/lib/object-storage');

const env = { WALLPAPER_STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://storage.yandexcloud.net', S3_REGION: 'ru-central1',
  S3_ORIGINALS_BUCKET: 'themesphone-test-originals', S3_PREVIEWS_BUCKET: 'themesphone-test-previews',
  S3_ACCESS_KEY_ID: 'test-access-key', S3_SECRET_ACCESS_KEY: 'test-secret-key' };
const key = 'a'.repeat(32) + '.jpg';
const bytes = Buffer.from('original');
const file = { storageKey: key, bytes: 8, mime: 'image/jpeg', storageBucket: env.S3_ORIGINALS_BUCKET,
  storageETag: '"original-etag"', storageVersion: 'version123', sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
const head = { ContentLength: 8, ContentType: 'image/jpeg', ETag: file.storageETag, Metadata: { sha256: file.sha256 } };

test('S3 configuration requires separate buckets, HTTPS Yandex endpoint and bounded expiry', () => {
  assert.equal(storageConfig(env).ttl, 120);
  for (const patch of [{ S3_ORIGINALS_BUCKET: env.S3_PREVIEWS_BUCKET }, { S3_ENDPOINT: 'http://169.254.169.254' },
    { S3_ENDPOINT: 'https://storage.yandexcloud.net.evil.test' }, { S3_SECRET_ACCESS_KEY: '' },
    { S3_REGION: 'other' }, { S3_ORIGINALS_BUCKET: '../secret' }, { S3_SIGNED_URL_TTL: '3600' }]) {
    assert.throws(() => storageConfig({ ...env, ...patch }), /invalid_s3_configuration/);
  }
});

test('S3 original upload is private, byte-exact and records object version/checksum', async () => {
  const storage = createObjectStorage(env, { client: { send: async command => {
    assert.equal(command.constructor.name, 'PutObjectCommand');
    assert.equal(command.input.Bucket, env.S3_ORIGINALS_BUCKET);
    assert.equal(command.input.Key, 'originals/' + key);
    assert.deepEqual(command.input.Body, bytes); assert.equal(command.input.ACL, 'private');
    assert.equal(command.input.Metadata.sha256, file.sha256);
    assert.equal(command.input.ContentMD5, crypto.createHash('md5').update(bytes).digest('base64'));
    return { ETag: file.storageETag, VersionId: file.storageVersion };
  } } });
  assert.deepEqual(await storage.put(key, bytes, file.mime), { storageProvider: 's3', storageBucket: file.storageBucket,
    storageVersion: file.storageVersion, storageETag: file.storageETag });
});

test('signing refuses changed metadata and foreign buckets before creating a URL', async () => {
  for (const patch of [{ ContentLength: 9 }, { ContentType: 'text/html' }, { Metadata: {} }, { ETag: 'changed' }]) {
    const storage = createObjectStorage(env, { client: { send: async () => ({ ...head, ...patch }) },
      sign: () => { throw Error('Must not sign'); } });
    await assert.rejects(storage.signedDownload(file, 'attachment; filename="file.jpg"'), /stored_file_changed/);
  }
  const storage = createObjectStorage(env, { client: { send: () => { throw Error('Must not request'); } } });
  await assert.rejects(storage.check({ ...file, storageBucket: env.S3_PREVIEWS_BUCKET }), /invalid_storage_record/);
  await assert.rejects(storage.check({ ...file, storageKey: '../other.jpg' }), /invalid_storage_key/);
});

test('real SDK signs only the private object version with native attachment and a short expiry', async () => {
  const storage = createObjectStorage(env);
  // Keep the actual SDK signer; avoid an external HEAD request in this unit test.
  storage.check = async () => {};
  try {
    const url = new URL(await storage.signedDownload(file, 'attachment; filename="file.jpg"'));
    assert.equal(url.origin, env.S3_ENDPOINT);
    assert.equal(url.pathname, '/' + env.S3_ORIGINALS_BUCKET + '/originals/' + key);
    assert.equal(url.searchParams.get('versionId'), file.storageVersion);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '120');
    assert.equal(url.searchParams.get('response-content-disposition'), 'attachment; filename="file.jpg"');
    assert.equal(url.searchParams.get('response-cache-control'), 'private, no-store');
    assert.match(url.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/);
    assert.equal(await storage.signedDownload(file, 'attachment', 'HEAD'), null);
  } finally { storage.close(); }
});

test('public originals and redirects fail the anonymous access check', async () => {
  for (const status of [200, 301, 404, 500]) {
    const storage = createObjectStorage(env, { client: {}, fetch: async (url, options) => {
      assert.equal(options.method, 'HEAD'); assert.equal(options.redirect, 'manual');
      assert.equal(url, env.S3_ENDPOINT + '/' + env.S3_ORIGINALS_BUCKET + '/originals/' + key);
      return new Response(null, { status });
    } });
    await assert.rejects(storage.assertPrivate(key), /original_bucket_must_be_private/);
  }
  await createObjectStorage(env, { client: {}, fetch: async () => new Response(null, { status: 403 }) }).assertPrivate(key);
});

test('the installed Strapi upload provider writes only to the public previews bucket', async () => {
  const configuration = require('../config/plugins')({ env: Object.assign(name => env[name], {
    bool: (_name, fallback) => fallback, int: () => 25,
  }) }).upload.config;
  assert.equal(configuration.provider, 'aws-s3');
  const providerOptions = configuration.providerOptions;
  let uploads = 0;
  providerOptions.s3Options.requestHandler = {
    handle: async request => {
      uploads++;
      assert.equal(request.hostname, 'storage.yandexcloud.net');
      assert.equal(request.path, '/' + env.S3_PREVIEWS_BUCKET + '/previews/test-preview.jpg');
      assert.equal(request.headers['x-amz-acl'], 'public-read');
      assert.equal(request.headers['content-type'], 'image/jpeg');
      return { response: { statusCode: 200, headers: { etag: '"test-preview"' }, body: require('node:stream').Readable.from([]) } };
    },
  };
  const provider = require('@strapi/provider-upload-aws-s3').init(providerOptions);
  assert.equal(provider.isPrivate(), false);
  const preview = { hash: 'test-preview', ext: '.jpg', mime: 'image/jpeg', buffer: bytes };
  await provider.upload(preview);
  assert.equal(uploads, 1);
  assert.equal(preview.url, env.S3_ENDPOINT + '/' + env.S3_PREVIEWS_BUCKET + '/previews/test-preview.jpg');
});
