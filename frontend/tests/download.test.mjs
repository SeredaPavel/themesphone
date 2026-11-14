import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { download } from '../src/lib/download.ts';
import { downloadHref, downloadReturn, ORIGINAL_MAX_BYTES, validOriginal } from '../src/lib/download-links.ts';

const originalOrigin = process.env.STRAPI_API_URL;
const originalBucket = process.env.S3_ORIGINALS_BUCKET;
const file = { id: 'original123', mime: 'image/jpeg', bytes: 8, width: 736, height: 1449 };
const attachment = "attachment; filename=\"themesphone-original123.jpg\"; filename*=UTF-8''%D0%9E%D1%81%D0%B5%D0%BD%D1%8C.jpg";
const req = (query = 'file=original123', init = {}) => new Request('https://themesphone.ru/api/download?' + query, init);
afterEach(() => { mock.restoreAll(); if (originalOrigin === undefined) delete process.env.STRAPI_API_URL; else process.env.STRAPI_API_URL = originalOrigin;
  if (originalBucket === undefined) delete process.env.S3_ORIGINALS_BUCKET; else process.env.S3_ORIGINALS_BUCKET = originalBucket; });

test('legacy URLs, duplicate IDs and traversal are rejected without an upstream request', async () => {
  const call = mock.method(globalThis, 'fetch', async () => { throw Error('Unexpected upstream'); });
  for (const query of ['url=http://127.0.0.1/admin', 'file=abc&url=https://evil.test', 'file=abc&file=other', 'file=../admin', 'file=https://evil.test', 'file=abc&name=evil']) {
    assert.equal((await download(req(query))).status, 400, query);
  }
  assert.equal(call.mock.callCount(), 0);
});

test('file streaming uses only the configured backend and safe attachment headers', async () => {
  process.env.STRAPI_API_URL = 'http://backend:1337';
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://backend:1337/api/wallpaper-files/original123/download');
    assert.equal(options.redirect, 'manual'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, undefined);
    return new Response('original', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '8', 'Content-Disposition': attachment } });
  });
  const response = await download(req());
  assert.equal(response.status, 200); assert.equal(await response.text(), 'original');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-disposition'), attachment);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('paid files and upstream redirects are never treated as downloads', async () => {
  process.env.STRAPI_API_URL = 'http://backend:1337';
  for (const status of [403, 404, 302, 500]) {
    mock.method(globalThis, 'fetch', async () => new Response(null, { status, headers: { Location: 'https://evil.test' } }));
    const response = await download(req());
    assert.equal(response.status, status === 403 || status === 404 ? status : 503);
    assert.equal(response.headers.get('content-disposition'), null);
  }
});

test('oversized, unknown, redirected and truncated data fail closed', async () => {
  process.env.STRAPI_API_URL = 'http://backend:1337';
  for (const headers of [
    { 'Content-Type': 'text/html', 'Content-Length': '8', 'Content-Disposition': attachment },
    { 'Content-Type': 'image/jpeg', 'Content-Length': String(ORIGINAL_MAX_BYTES + 1), 'Content-Disposition': attachment },
    { 'Content-Type': 'image/jpeg', 'Content-Length': '8', 'Content-Disposition': 'inline' },
  ]) {
    mock.method(globalThis, 'fetch', async () => new Response('original', { headers }));
    assert.equal((await download(req())).status, 503);
  }
  for (const length of ['7', '9']) {
    mock.method(globalThis, 'fetch', async () => new Response('original', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': length, 'Content-Disposition': attachment } }));
    const response = await download(req());
    await assert.rejects(response.arrayBuffer(), /Download interrupted/);
  }
});

test('HEAD checks headers without transferring a file and browser errors stay on the site', async () => {
  process.env.STRAPI_API_URL = 'http://backend:1337';
  mock.method(globalThis, 'fetch', async (_, options) => {
    assert.equal(options.method, 'HEAD');
    return new Response(null, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '8', 'Content-Disposition': attachment } });
  });
  const head = await download(req(undefined, { method: 'HEAD' }));
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  const browser = await download(req('file=original123&wallpaper=wallpaper123&from=https://evil.test', { headers: { Accept: 'text/html' } }));
  assert.equal(browser.status, 303);
  assert.equal(browser.headers.get('location'), '/download/error?reason=file_unavailable&wallpaper=wallpaper123');
});

test('public links accept file IDs and keep only safe catalogue return targets', () => {
  assert.equal(downloadHref(file, 'wallpaper123', '/category/cars'), '/api/download?file=original123&wallpaper=wallpaper123&from=%2Fcategory%2Fcars');
  assert.equal(downloadHref({ ...file, id: 'https://evil.test' }, 'wallpaper123'), null);
  assert.equal(downloadReturn('wallpaper123', '//evil.test'), '/wallpaper/wallpaper123');
  assert.equal(downloadReturn('https://evil.test', '//evil.test'), '/');
  assert.equal(validOriginal({ ...file, bytes: -1 }), false);
});

test('S3 redirects go only to our private bucket; the frontend never fetches the object', async () => {
  process.env.STRAPI_API_URL = 'http://backend:1337';
  process.env.S3_ORIGINALS_BUCKET = 'themesphone-test-originals';
  const target = new URL('https://storage.yandexcloud.net/themesphone-test-originals/originals/' + 'a'.repeat(32) + '.jpg');
  target.search = new URLSearchParams({ 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Signature': 'b'.repeat(64),
    'X-Amz-Expires': '120', 'response-content-disposition': attachment }).toString();
  const call = mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { Location: target.href } }));
  const response = await download(req());
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), target.href);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer'); assert.equal(call.mock.callCount(), 1);
  for (const bad of [target.href.replace('storage.yandexcloud.net', 'evil.test'),
    target.href.replace('themesphone-test-originals', 'other-bucket'), target.href.replace('/originals/', '/previews/'),
    target.href.replace('X-Amz-Expires=120', 'X-Amz-Expires=3600')]) {
    mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { Location: bad } }));
    assert.equal((await download(req())).status, 503);
  }
});
