export const CATALOG_PAGE_SIZE = 12;
export const CATALOG_SORTS = {
  default: { label: 'По умолчанию', value: '' },
  newest: { label: 'Сначала новые', value: 'createdAt:desc' },
  'price-asc': { label: 'Сначала дешевле', value: 'price:asc' },
  'price-desc': { label: 'Сначала дороже', value: 'price:desc' },
  title: { label: 'По названию', value: 'title:asc' },
};

export type CatalogSearchParams = Record<string, string | string[] | undefined>;
export type CatalogFilters = {
  category: string;
  device: string;
  q: string;
  sort: keyof typeof CATALOG_SORTS;
  page: number;
};

export function parseCatalogFilters(params: CatalogSearchParams): CatalogFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || '';
  const sort = first(params.sort);
  const page = first(params.page);
  return {
    category: first(params.category).trim().slice(0, 100),
    device: first(params.device).trim().slice(0, 100),
    q: first(params.q).trim().slice(0, 100),
    sort: Object.hasOwn(CATALOG_SORTS, sort) ? sort as CatalogFilters['sort'] : 'default',
    page: /^\d{1,5}$/.test(page) && Number(page) > 0 ? Math.min(Number(page), 10000) : 1,
  };
}

export function buildWallpaperQuery(filters: CatalogFilters): URLSearchParams {
  const query = new URLSearchParams({ status: 'published' });
  ['image', 'categories', 'device'].forEach((relation, i) => query.set(`populate[${i}]`, relation));
  if (filters.category) query.set('filters[categories][slug][$eq]', filters.category);
  if (filters.device) query.set('filters[device][slug][$eq]', filters.device);
  if (filters.q) query.set('filters[title][$containsi]', filters.q);
  if (CATALOG_SORTS[filters.sort].value) {
    query.set('sort[0]', CATALOG_SORTS[filters.sort].value);
    query.set('sort[1]', 'id:desc');
  }
  query.set('pagination[page]', String(filters.page));
  query.set('pagination[pageSize]', String(CATALOG_PAGE_SIZE));
  return query;
}

export function catalogPageHref(pathname: string, filters: CatalogFilters, page: number): string {
  const query = new URLSearchParams();
  const base = catalogBaseFilters(pathname);
  if (filters.category !== base.category) query.set('category', filters.category);
  if (filters.device !== base.device) query.set('device', filters.device);
  if (filters.q) query.set('q', filters.q);
  if (filters.sort !== 'default') query.set('sort', filters.sort);
  if (page > 1) query.set('page', String(page));
  return `${pathname}${query.size ? `?${query}` : ''}`;
}

export function isCatalogPath(pathname: string): boolean {
  return pathname === '/' || /^\/(category|device)\/[a-zA-Z0-9_-]+$/.test(pathname);
}

export function catalogBaseFilters(pathname: string): { category: string; device: string } {
  const match = /^\/(category|device)\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  return {
    category: match?.[1] === 'category' ? match[2] : '',
    device: match?.[1] === 'device' ? match[2] : '',
  };
}

export function catalogLocationFilters(pathname: string, params: CatalogSearchParams): CatalogFilters {
  const base = catalogBaseFilters(pathname);
  return parseCatalogFilters({ ...params,
    category: params.category === undefined ? base.category : params.category,
    device: params.device === undefined ? base.device : params.device,
  });
}

export function hasCatalogFilters(pathname: string, params: CatalogSearchParams): boolean {
  const base = catalogBaseFilters(pathname);
  const filters = catalogLocationFilters(pathname, params);
  return filters.category !== base.category || filters.device !== base.device ||
    !!filters.q || filters.sort !== 'default' || filters.page > 1;
}

// Return targets come from links and can also be supplied directly by a visitor.
// Accept catalogue routes only; discard unrelated query parameters and fragments.
export function safeCatalogReturn(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://catalog.invalid');
    if (url.origin !== 'https://catalog.invalid' || !isCatalogPath(url.pathname)) return null;
    const filters = catalogLocationFilters(url.pathname, Object.fromEntries(url.searchParams));
    return catalogPageHref(url.pathname, filters, filters.page);
  } catch {
    return null;
  }
}

export function wallpaperDetailHref(identifier: string, returnTo?: string | null): string {
  const target = safeCatalogReturn(returnTo);
  const path = `/wallpaper/${encodeURIComponent(identifier)}`;
  return target ? `${path}?${new URLSearchParams({ from: target })}` : path;
}
