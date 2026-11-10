import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogLocationFilters, catalogPageHref, hasCatalogFilters, safeCatalogReturn, wallpaperDetailHref } from '../src/lib/catalog-query.ts';

test('a selected category is the base, not an extra filter', () => {
  const filters = catalogLocationFilters('/category/cars', {});
  assert.equal(filters.category, 'cars');
  assert.equal(hasCatalogFilters('/category/cars', {}), false);
  assert.equal(hasCatalogFilters('/category/cars', { device: 'android' }), true);
  assert.equal(catalogPageHref('/category/cars', filters, 1), '/category/cars');
});

test('the filter can override the category while keeping the original category in the path', () => {
  const filters = catalogLocationFilters('/category/cars', { category: 'space', device: 'iphone', sort: 'price-asc' });
  assert.equal(filters.category, 'space');
  const href = catalogPageHref('/category/cars', filters, 1);
  assert.equal(href, '/category/cars?category=space&device=iphone&sort=price-asc');
  assert.equal(new URL(href, 'https://example.test').pathname, '/category/cars');
});

test('all categories explicitly clears the base category without losing its reset target', () => {
  const filters = catalogLocationFilters('/category/cars', { category: '' });
  assert.equal(filters.category, '');
  assert.equal(catalogPageHref('/category/cars', filters, 1), '/category/cars?category=');
  assert.equal(hasCatalogFilters('/category/cars', { category: '' }), true);
  assert.equal(safeCatalogReturn('/category/cars?category='), '/category/cars?category=');
});

test('product links preserve the complete filtered page as the return target', () => {
  const filters = catalogLocationFilters('/category/cars', { device: 'android', q: 'car & night', sort: 'title', page: '3' });
  const catalogue = catalogPageHref('/category/cars', filters, filters.page);
  const product = new URL(wallpaperDetailHref('published123', catalogue), 'https://example.test');
  assert.equal(product.pathname, '/wallpaper/published123');
  assert.equal(safeCatalogReturn(product.searchParams.get('from')), catalogue);
  assert.equal(new URL(catalogue, 'https://example.test').pathname, '/category/cars');
});

test('a directly opened product has no fabricated return target', () => {
  assert.equal(wallpaperDetailHref('published123'), '/wallpaper/published123');
  assert.equal(safeCatalogReturn(undefined), null);
  assert.equal(safeCatalogReturn(['/category/cars']), null);
});

test('return targets cannot navigate to external sites or application APIs', () => {
  for (const target of ['https://evil.example', '//evil.example', '/\\evil.example', '/api/download', '/account', '/wallpaper/other', '/category/%2f%2fevil', '/category/cars\n']) {
    assert.equal(safeCatalogReturn(target), null, target);
  }
  assert.equal(wallpaperDetailHref('published123', '//evil.example'), '/wallpaper/published123');
});

test('return targets keep only supported catalogue parameters', () => {
  assert.equal(safeCatalogReturn('/category/cars?device=android&from=https://evil.example&token=secret#fragment'), '/category/cars?device=android');
  assert.equal(safeCatalogReturn('/?q=cosmos&sort=invalid&page=-1'), '/?q=cosmos');
});
