import { buildWallpaperQuery } from './catalog-query';
import type { CatalogFilters } from './catalog-query';
import type { Wallpaper } from './wallpaper.server';

const publicOrigin = process.env.NEXT_PUBLIC_STRAPI_URL || 'http://127.0.0.1:1337';
const API_URL = `${typeof window === 'undefined' ? (process.env.STRAPI_API_URL || publicOrigin) : publicOrigin}/api`;

export type TaxonomyItem = { id: number; title: string; slug: string; description?: string | null };
export type WallpaperPage = {
  data: Wallpaper[];
  meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } };
};

export async function getWallpaperPage(filters: CatalogFilters): Promise<WallpaperPage> {
  const res = await fetch(`${API_URL}/wallpapers?${buildWallpaperQuery(filters)}`, {
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error('Ошибка загрузки каталога');
  const json = await res.json();
  if (!Array.isArray(json.data) || !json.meta?.pagination) throw new Error('Некорректный ответ каталога');
  return json;
}

async function getTaxonomy(collection: 'categories' | 'devices'): Promise<TaxonomyItem[]> {
  const items: TaxonomyItem[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const query = new URLSearchParams({ status: 'published', 'pagination[pageSize]': '100', 'pagination[page]': String(page), 'sort[0]': 'title:asc', 'sort[1]': 'id:asc' });
    const res = await fetch(`${API_URL}/${collection}?${query}`, {
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Ошибка загрузки ${collection}`);
    const json = await res.json();
    if (!Array.isArray(json.data)) throw new Error('Некорректный ответ списка разделов');
    items.push(...json.data.filter((item: TaxonomyItem) => typeof item.slug === 'string' && item.slug.length > 0));
    pageCount = json.meta?.pagination?.pageCount || 1;
    page += 1;
  } while (page <= pageCount);
  return items;
}

export const getCategories = () => getTaxonomy('categories');
export const getDevices = () => getTaxonomy('devices');
