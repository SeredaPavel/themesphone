'use strict';

const crypto = require('node:crypto');
const BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const KEY = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

function storageConfig(env = process.env) {
  if (env.WALLPAPER_STORAGE_DRIVER !== 's3' || env.S3_ENDPOINT !== 'https://storage.yandexcloud.net' ||
      env.S3_REGION !== 'ru-central1' || !BUCKET.test(env.S3_ORIGINALS_BUCKET || '') ||
      !BUCKET.test(env.S3_PREVIEWS_BUCKET || '') || env.S3_ORIGINALS_BUCKET === env.S3_PREVIEWS_BUCKET ||
      !env.S3_ACCESS_KEY_ID?.trim() || !env.S3_SECRET_ACCESS_KEY?.trim()) throw Error('invalid_s3_configuration');
  const ttl = Number(env.S3_SIGNED_URL_TTL || 120);
  if (!Number.isInteger(ttl) || ttl < 30 || ttl > 300) throw Error('invalid_s3_configuration');
  return { endpoint: env.S3_ENDPOINT, region: env.S3_REGION, originalsBucket: env.S3_ORIGINALS_BUCKET,
    previewsBucket: env.S3_PREVIEWS_BUCKET, ttl,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } };
}

function clientOptions(config) {
  return { endpoint: config.endpoint, region: config.region, credentials: config.credentials, forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 } };
}

function createObjectStorage(env = process.env, dependencies = {}) {
  const config = storageConfig(env);
  const sdk = require('@aws-sdk/client-s3');
  const client = dependencies.client || new sdk.S3Client(clientOptions(config));
  const sign = dependencies.sign || require('@aws-sdk/s3-request-presigner').getSignedUrl;
  const input = (key, versionId) => {
    if (!KEY.test(key || '')) throw Error('invalid_storage_key');
    return { Bucket: config.originalsBucket, Key: 'originals/' + key, ...(versionId ? { VersionId: versionId } : {}) };
  };
  const send = command => client.send(command, { abortSignal: AbortSignal.timeout(30000) });
  return {
    config,
    async put(key, bytes, mime) {
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      const result = await send(new sdk.PutObjectCommand({ ...input(key), Body: bytes, ContentType: mime,
        ContentLength: bytes.length, ContentMD5: crypto.createHash('md5').update(bytes).digest('base64'),
        Metadata: { sha256: hash }, ACL: 'private', CacheControl: 'private, no-store' }));
      return { storageProvider: 's3', storageBucket: config.originalsBucket, storageVersion: result.VersionId || null,
        storageETag: result.ETag || null };
    },
    async check(file) {
      if (file.storageBucket !== config.originalsBucket || !file.storageETag) throw Error('invalid_storage_record');
      const head = await send(new sdk.HeadObjectCommand(input(file.storageKey, file.storageVersion)));
      if (head.ContentLength !== Number(file.bytes) || head.ContentType !== file.mime ||
          head.Metadata?.sha256 !== file.sha256 || head.ETag !== file.storageETag) throw Error('stored_file_changed');
    },
    async assertPrivate(key) {
      const object = input(key);
      const response = await (dependencies.fetch || fetch)(`${config.endpoint}/${object.Bucket}/${object.Key}`, {
        method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000),
      });
      if (response.status !== 403) throw Error('original_bucket_must_be_private');
    },
    async signedDownload(file, attachment, method = 'GET') {
      await this.check(file);
      // HEAD is answered by Strapi after the check; never give a GET signature to a HEAD client.
      if (method === 'HEAD') return null;
      const url = await sign(client, new sdk.GetObjectCommand({ ...input(file.storageKey, file.storageVersion),
        ResponseContentDisposition: attachment, ResponseContentType: file.mime, ResponseCacheControl: 'private, no-store' }), { expiresIn: config.ttl });
      const parsed = new URL(url);
      if (parsed.origin !== config.endpoint || parsed.pathname !== '/' + config.originalsBucket + '/originals/' + file.storageKey ||
          parsed.username || parsed.password || parsed.hash) throw Error('invalid_signed_download');
      return url;
    },
    async remove(key, versionId) { await send(new sdk.DeleteObjectCommand(input(key, versionId))); },
    close() { client.destroy?.(); },
  };
}

module.exports = { storageConfig, clientOptions, createObjectStorage };
