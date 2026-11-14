import type { OriginalFile } from './download-links';

export type DescriptionNode = {
  text?: string;
  children?: DescriptionNode[];
};

export type WallpaperImage = {
  id: number;
  url: string;
  alternativeText?: string | null;
  width?: number | null;
  height?: number | null;
  mime?: string;
  formats?: { medium?: { url: string }; small?: { url: string } };
};

export type Wallpaper = {
  id: number;
  documentId: string;
  title: string;
  description?: DescriptionNode[] | string | null;
  price: string | number;
  isFree: boolean | null;
  image?: WallpaperImage[];
  categories?: { title: string; slug: string }[];
  device?: { title: string; slug: string } | null;
  originalFile?: OriginalFile | null;
};

// Only server components import this module: Docker DNS stays on the server.
export async function getWallpaper(identifier: string): Promise<Wallpaper | null> {
  if (!/^[a-zA-Z0-9]{1,64}$/.test(identifier)) return null;

  const origin = process.env.STRAPI_API_URL || process.env.NEXT_PUBLIC_STRAPI_URL || 'http://127.0.0.1:1337';
  const legacyId = /^\d+$/.test(identifier);
  const query = new URLSearchParams({ status: 'published' });
  ['image', 'categories', 'device'].forEach((relation, index) => {
    query.set(`populate[${index}]`, relation);
  });
  if (legacyId) {
    // Existing links used numeric row IDs rather than documentId.
    query.set('filters[id][$eq]', identifier);
    query.set('pagination[limit]', '1');
  }

  const path = legacyId ? 'wallpapers' : `wallpapers/${encodeURIComponent(identifier)}`;
  const response = await fetch(`${origin.replace(/\/$/, '')}/api/${path}?${query}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Wallpaper API returned ${response.status}`);

  const payload = await response.json();
  const wallpaper = legacyId ? payload.data?.[0] : payload.data;
  if (wallpaper == null) return null;
  if (!Number.isInteger(wallpaper.id) || typeof wallpaper.documentId !== 'string' ||
      !/^[a-zA-Z0-9]{1,64}$/.test(wallpaper.documentId) || typeof wallpaper.title !== 'string') {
    throw new Error('Unexpected wallpaper response format');
  }
  return wallpaper;
}

export function getWallpaperImageUrl(path: string): string | null {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_STRAPI_URL || 'http://127.0.0.1:1337');
    const url = new URL(path, origin);
    const bucket = process.env.S3_PREVIEWS_BUCKET;
    if (bucket && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) &&
        url.origin === 'https://storage.yandexcloud.net' && url.pathname.startsWith(`/${bucket}/previews/`) &&
        !url.search && !url.hash && !url.username && !url.password) return url.href;
    return url.origin === origin.origin && url.pathname.startsWith('/uploads/') && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function getDescriptionParagraphs(description: Wallpaper['description']): string[] {
  if (typeof description === 'string') return [description];
  if (!Array.isArray(description)) return [];
  const text = (node: DescriptionNode): string =>
    typeof node.text === 'string' ? node.text : (node.children || []).map(text).join('');
  return description.map(text).filter(paragraph => paragraph.trim());
}
