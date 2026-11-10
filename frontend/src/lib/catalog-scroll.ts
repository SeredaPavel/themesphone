const KEY = 'themesphone:catalog-scroll:';
const RESTORE = 'themesphone:restore-catalog';

export function rememberCatalogScroll(href: string) {
  try {
    sessionStorage.setItem(KEY + href, JSON.stringify({ y: window.scrollY, savedAt: Date.now() }));
  } catch { /* Navigation still works when browser storage is unavailable. */ }
}

export function requestCatalogScroll(href: string) {
  try { sessionStorage.setItem(RESTORE, href); } catch { /* Optional enhancement. */ }
}

export function restoreCatalogScroll(href: string) {
  try {
    if (sessionStorage.getItem(RESTORE) !== href) return;
    sessionStorage.removeItem(RESTORE);
    const value = JSON.parse(sessionStorage.getItem(KEY + href) || 'null');
    if (!value || !Number.isFinite(value.y) || value.y < 0 || !Number.isFinite(value.savedAt) ||
        Date.now() - value.savedAt < 0 || Date.now() - value.savedAt > 30 * 60_000) return;
    window.scrollTo({ top: value.y, behavior: 'instant' });
  } catch { /* The catalogue remains usable without saved scroll state. */ }
}
