'use strict';

// Standalone check: no Strapi startup, database access or credential output.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createObjectStorage, clientOptions } = require('../src/lib/object-storage');
const { S3Client, HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--write-test') || args.length > 1) throw Error('invalid_arguments');
  const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../../.local/storage/backend.env')));
  const storage = createObjectStorage(env);
  const client = new S3Client(clientOptions(storage.config));
  const send = command => client.send(command, { abortSignal: AbortSignal.timeout(30000) });
  let originalKey, originalVersion, previewKey, previewVersion;
  try {
    for (const Bucket of [storage.config.originalsBucket, storage.config.previewsBucket]) await send(new HeadBucketCommand({ Bucket }));
    if (!args.includes('--write-test')) {
      console.log('SUCCESS: S3 credentials can access both buckets; no files were written.');
      return;
    }
    const bytes = await require('sharp')({ create: { width: 32, height: 64, channels: 3, background: '#12545a' } }).jpeg().toBuffer();
    originalKey = crypto.randomBytes(16).toString('hex') + '.jpg';
    const record = await storage.put(originalKey, bytes, 'image/jpeg');
    originalVersion = record.storageVersion;
    const file = { ...record, storageKey: originalKey, bytes: bytes.length, mime: 'image/jpeg',
      sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    await storage.check(file);
    await storage.assertPrivate(originalKey);
    const url = await storage.signedDownload(file, 'attachment; filename="themesphone-storage-check.jpg"');
    const download = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (download.status !== 200 || !download.headers.get('content-disposition')?.startsWith('attachment;') ||
        Number(download.headers.get('content-length')) !== bytes.length ||
        !Buffer.from(await download.arrayBuffer()).equals(bytes)) throw Error('signed_download_failed');
    previewKey = 'previews/storage-check-' + crypto.randomBytes(16).toString('hex') + '.jpg';
    const result = await send(new PutObjectCommand({ Bucket: storage.config.previewsBucket, Key: previewKey,
      Body: bytes, ContentType: 'image/jpeg', ACL: 'public-read', ContentLength: bytes.length,
      ContentMD5: crypto.createHash('md5').update(bytes).digest('base64') }));
    previewVersion = result.VersionId;
    const preview = await fetch(`${storage.config.endpoint}/${storage.config.previewsBucket}/${previewKey}`, {
      redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    if (preview.status !== 200 || Number(preview.headers.get('content-length')) !== bytes.length ||
        !Buffer.from(await preview.arrayBuffer()).equals(bytes)) throw Error('public_preview_failed');
    console.log('SUCCESS: private original, signed native download and public preview verified.');
  } finally {
    // Remove only randomly named objects created by this invocation, including their versions.
    const cleanup = await Promise.allSettled([
      ...(originalKey ? [storage.remove(originalKey, originalVersion)] : []),
      ...(previewKey ? [send(new DeleteObjectCommand({ Bucket: storage.config.previewsBucket, Key: previewKey,
        ...(previewVersion ? { VersionId: previewVersion } : {}) }))] : []),
    ]);
    storage.close(); client.destroy();
    if (cleanup.some(item => item.status === 'rejected')) throw Error('test_object_cleanup_failed');
    if (originalKey || previewKey) console.log('SUCCESS: temporary test objects removed.');
  }
}

main().catch(error => {
  const allowed = ['invalid_arguments', 'invalid_s3_configuration', 'original_bucket_must_be_private',
    'signed_download_failed', 'public_preview_failed', 'stored_file_changed', 'test_object_cleanup_failed'];
  const status = Number(error.$metadata?.httpStatusCode);
  console.error('Storage check failed: ' + (allowed.includes(error.message) ? error.message :
    status === 403 ? 'access_denied_check_key_and_bucket_permissions' : status === 404 ? 'bucket_or_object_not_found' : 'check_configuration_and_network'));
  process.exitCode = 1;
});
