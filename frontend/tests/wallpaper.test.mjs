import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { getWallpaper, getWallpaperImageUrl, getDescriptionParagraphs } from '../src/lib/wallpaper.server.ts';

const wallpaper = {
  id: 46, documentId: 'abc123published', title: 'Осенний автомобиль',
  isFree: true, price: '0', image: [], categories: [], device: null,
};
const oldServerOrigin = process.env.STRAPI_API_URL;
const oldPublicOrigin = process.env.NEXT_PUBLIC_STRAPI_URL;

afterEach(() => {
  mock.restoreAll();
  for (const [key, value] of [['STRAPI_API_URL', oldServerOrigin], ['NEXT_PUBLIC_STRAPI_URL', oldPublicOrigin]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('loads a Strapi 5 document through the server origin, without an API token', async () => {
  process.env.STRAPI_API_URL = 'http://backend:1337/';
  process.env.NEXT_PUBLIC_STRAPI_URL = 'https://cms.example.test';
  const request = mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, 'http://backend:1337');
    assert.equal(url.pathname, '/api/wallpapers/abc123published');
    assert.equal(url.searchParams.get('status'), 'published');
    assert.deepEqual([0, 1, 2].map(i => url.searchParams.get(`populate[${i}]`)), ['image', 'categories', 'device']);
    assert.equal(url.searchParams.has('populate'), false);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ data: wallpaper });
  });
  assert.deepEqual(await getWallpaper('abc123published'), wallpaper);
  assert.equal(request.mock.callCount(), 1);
});

test('resolves old numeric links using a published collection filter', async () => {
  mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.equal(url.pathname, '/api/wallpapers');
    assert.equal(url.searchParams.get('filters[id][$eq]'), '46');
    assert.equal(url.searchParams.get('pagination[limit]'), '1');
    return Response.json({ data: [wallpaper] });
  });
  assert.equal((await getWallpaper('46')).documentId, wallpaper.documentId);
});

test('missing document and empty legacy lookup produce a not-found result', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  assert.equal(await getWallpaper('missing'), null);
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => Response.json({ data: [] }));
  assert.equal(await getWallpaper('999'), null);
});

test('rejects invalid identifiers without making a request', async () => {
  const request = mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request'); });
  for (const id of ['', '../users', 'item?status=draft', 'a'.repeat(65)]) {
    assert.equal(await getWallpaper(id), null);
  }
  assert.equal(request.mock.callCount(), 0);
});

test('API failures stay errors rather than looking like missing products', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await assert.rejects(getWallpaper('abc123published'), /503/);
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network unavailable'); });
  await assert.rejects(getWallpaper('abc123published'), /Network unavailable/);
});

test('does not silently accept legacy attributes responses', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ data: { id: 46, attributes: { title: 'Old format' } } }));
  await assert.rejects(getWallpaper('abc123published'), /response format/);
});

test('media URL uses the public CMS origin and accepts only its uploads', () => {
  process.env.NEXT_PUBLIC_STRAPI_URL = 'https://cms.example.test';
  assert.equal(getWallpaperImageUrl('/uploads/car.jpg'), 'https://cms.example.test/uploads/car.jpg');
  assert.equal(getWallpaperImageUrl('https://cms.example.test/uploads/car.jpg'), 'https://cms.example.test/uploads/car.jpg');
  for (const url of ['https://other.example/uploads/car.jpg', 'javascript:alert(1)', '/admin', '/uploads/../admin']) {
    assert.equal(getWallpaperImageUrl(url), null);
  }
});

test('renders nested Strapi description text without interpreting HTML', () => {
  assert.deepEqual(getDescriptionParagraphs([
    { children: [{ text: 'Обои ' }, { children: [{ text: 'для телефона' }] }] },
    { children: [{ text: '<script>literal text</script>' }] },
    { children: [{ text: '' }] },
  ]), ['Обои для телефона', '<script>literal text</script>']);
  assert.deepEqual(getDescriptionParagraphs(null), []);
  assert.deepEqual(getDescriptionParagraphs('Описание'), ['Описание']);
});
