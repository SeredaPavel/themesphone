import { safeCatalogReturn, wallpaperDetailHref } from './catalog-query.ts';

export type OriginalFile = { id: string; mime: 'image/jpeg' | 'image/png' | 'image/webp'; bytes: number; width: number; height: number };
export const ORIGINAL_MAX_BYTES = 50 * 1024 * 1024;
export function validFileId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9]{1,64}$/.test(value); }

export function validOriginal(value: unknown): value is OriginalFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as OriginalFile;
  return validFileId(file.id) && ['image/jpeg', 'image/png', 'image/webp'].includes(file.mime) &&
    Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= ORIGINAL_MAX_BYTES &&
    Number.isInteger(file.width) && file.width > 0 && Number.isInteger(file.height) && file.height > 0;
}

export function downloadHref(file: OriginalFile, wallpaper: string, returnTo?: string | null): string | null {
  if (!validOriginal(file) || !validFileId(wallpaper)) return null;
  const query = new URLSearchParams({ file: file.id, wallpaper });
  const catalog = safeCatalogReturn(returnTo);
  if (catalog) query.set('from', catalog);
  return '/api/download?' + query;
}

export function downloadReturn(wallpaper: unknown, from: unknown): string {
  return validFileId(wallpaper) ? wallpaperDetailHref(wallpaper, safeCatalogReturn(from)) : safeCatalogReturn(from) || '/';
}

export function originalDescription(file: OriginalFile) {
  return { format: ({ 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' })[file.mime],
    resolution: `${file.width} × ${file.height}`,
    size: file.bytes < 1024 * 1024 ? `${Math.ceil(file.bytes / 1024)} КБ` : `${(file.bytes / (1024 * 1024)).toFixed(1)} МБ` };
}
