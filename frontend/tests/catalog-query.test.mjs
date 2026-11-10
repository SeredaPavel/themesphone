import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCatalogFilters, buildWallpaperQuery, catalogPageHref, CATALOG_PAGE_SIZE } from '../src/lib/catalog-query.ts';

test('search, category and device work together and select a published page', () => {
  const filters = parseCatalogFilters({ q: '  cosmos  ', category: 'space', device: 'iphone', sort: 'price-asc', page: '2' });
  const query = buildWallpaperQuery(filters);
  assert.equal(query.get('filters[title][$containsi]'), 'cosmos');
  assert.equal(query.get('filters[categories][slug][$eq]'), 'space');
  assert.equal(query.get('filters[device][slug][$eq]'), 'iphone');
  assert.equal(query.get('status'), 'published');
  assert.equal(query.get('sort[0]'), 'price:asc');
  assert.equal(query.get('pagination[page]'), '2');
  assert.equal(query.get('pagination[pageSize]'), String(CATALOG_PAGE_SIZE));
  assert.equal(query.has('pagination[limit]'), false);
});

test('unknown sorting and invalid pages fall back to usable defaults', () => {
  for (const page of ['0', '-1', '1.5', 'NaN', '9999999999999']) {
    assert.equal(parseCatalogFilters({ page }).page, 1);
  }
  for (const sort of ['__proto__', 'constructor', 'paid:desc']) {
    assert.equal(parseCatalogFilters({ sort }).sort, 'default');
  }
  assert.equal(parseCatalogFilters({ page: '99999' }).page, 10000);
  assert.equal(parseCatalogFilters({ q: ['first', 'second'] }).q, 'first');
  assert.equal(parseCatalogFilters({ q: 'x'.repeat(1000) }).q.length, 100);
});

test('default catalogue keeps the existing CMS order', () => {
  const query = buildWallpaperQuery(parseCatalogFilters({}));
  assert.equal(query.has('sort[0]'), false);
  assert.equal(query.has('sort[1]'), false);
});

test('pagination preserves search, sorting and both filters on the home page', () => {
  const filters = parseCatalogFilters({ q: 'машины & космос', category: 'cars', device: 'android', sort: 'title' });
  const url = new URL(catalogPageHref('/', filters, 2), 'https://example.test');
  assert.equal(url.searchParams.get('q'), 'машины & космос');
  assert.equal(url.searchParams.get('category'), 'cars');
  assert.equal(url.searchParams.get('device'), 'android');
  assert.equal(url.searchParams.get('sort'), 'title');
  assert.equal(url.searchParams.get('page'), '2');
});

test('category and device paths keep their fixed filter and reset page one cleanly', () => {
  const filters = parseCatalogFilters({ category: 'cars', device: 'android', q: 'car' });
  const category = new URL(catalogPageHref('/category/cars', filters, 1), 'https://example.test');
  assert.equal(category.searchParams.has('category'), false);
  assert.equal(category.searchParams.has('page'), false);
  assert.equal(category.searchParams.get('device'), 'android');
  const device = new URL(catalogPageHref('/device/android', filters, 3), 'https://example.test');
  assert.equal(device.searchParams.has('device'), false);
  assert.equal(device.searchParams.get('category'), 'cars');
  assert.equal(catalogPageHref('/', parseCatalogFilters({}), 1), '/');
});
