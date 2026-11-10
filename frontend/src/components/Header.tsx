'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShoppingCart, UserCircle2 } from 'lucide-react';
import { getCategories, getDevices } from '@/lib/api';
import type { TaxonomyItem } from '@/lib/api';
import { catalogLocationFilters, catalogPageHref, hasCatalogFilters, isCatalogPath, safeCatalogReturn } from '@/lib/catalog-query';
import { useCart } from '@/context/CartContext';
import { useAuthContext } from '@/context/AuthContext';
import AuthModal from './AuthModal';
import BurgerMenu from './BurgerMenu';
import CatalogBackLink from './CatalogBackLink';
import CatalogFilterPanel from './CatalogFilterPanel';

const buttonClass = 'text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition whitespace-nowrap';

export default function Header() {
  const [hydrated, setHydrated] = useState(false);
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [devices, setDevices] = useState<TaxonomyItem[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [menu, setMenu] = useState<'categories' | 'profile' | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const header = useRef<HTMLElement>(null);
  const filterDropdown = useRef<HTMLDivElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const { cartItems } = useCart();
  const { user, setUser, loading } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = pathname + '?' + searchParams.toString();
  const product = pathname.startsWith('/wallpaper/');
  const savedReturnTo = safeCatalogReturn(searchParams.get('from'));
  const returnTo = savedReturnTo || '/';
  const context = new URL(product ? returnTo : isCatalogPath(pathname) ? locationKey : '/', 'https://catalog.invalid');
  const filters = catalogLocationFilters(context.pathname, Object.fromEntries(context.searchParams));
  const backHref = product ? returnTo : isCatalogPath(pathname) && hasCatalogFilters(pathname, Object.fromEntries(searchParams)) ? pathname : undefined;

  useEffect(() => {
    setHydrated(true);
    let ignore = false;
    setLoadingOptions(true); setOptionsError(false);
    Promise.all([getCategories(), getDevices()]).then(([nextCategories, nextDevices]) => {
      if (!ignore) { setCategories(nextCategories); setDevices(nextDevices); }
    }).catch(() => { if (!ignore) setOptionsError(true); }).finally(() => { if (!ignore) setLoadingOptions(false); });
    return () => { ignore = true; };
  }, [revision]);

  useEffect(() => {
    setMenu(null); setFilterOpen(false);
    if (searchParams.get('auth') === 'popup') setAuthOpen(true);
  }, [locationKey]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMenu(null);
      if (!filterDropdown.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => { document.removeEventListener('pointerdown', close); if (leaveTimer.current) clearTimeout(leaveTimer.current); };
  }, []);

  function openMenu(next: 'categories' | 'profile') {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setFilterOpen(false);
    setMenu(next);
  }
  function leaveMenu() { leaveTimer.current = setTimeout(() => setMenu(null), 250); }
  function toggleFilter() { setMenu(null); setFilterOpen(value => !value); }
  function openCart() { setFilterOpen(false); if (!user) setAuthOpen(true); else router.push('/cart'); }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('token');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setUser(null); setMenu(null); router.refresh();
  }

  function renderFilter(closeMobile?: () => void) {
    return <CatalogFilterPanel key={locationKey} initial={filters} categories={categories} devices={devices}
      loading={loadingOptions} error={optionsError} onReload={() => setRevision(value => value + 1)}
      onApply={draft => { setFilterOpen(false); closeMobile?.(); router.push(catalogPageHref(context.pathname, draft, 1)); }}
      onReset={() => { setFilterOpen(false); closeMobile?.(); router.push(context.pathname); }} />;
  }

  return <header ref={header} onKeyDown={event => { if (event.key === 'Escape') { setMenu(null); if (filterOpen) { setFilterOpen(false); filterTrigger.current?.focus(); } } }}
    className="w-full py-4 px-6 bg-[var(--background)] text-[var(--foreground)] shadow-md flex justify-between items-center z-[60] relative">
    <div className="text-2xl font-bold"><Link href="/">ThemesPhone</Link></div>
    <nav aria-label="Главное меню" className="hidden md:flex gap-3 text-sm relative items-center">
      {backHref && <CatalogBackLink href={backHref} restoreScroll={product && !!savedReturnTo} className={buttonClass} />}
      <div className="relative" onMouseEnter={() => openMenu('categories')} onMouseLeave={leaveMenu}>
        <button className={buttonClass} aria-expanded={menu === 'categories'} onClick={() => openMenu('categories')}>Категории</button>
        {menu === 'categories' && <div className="absolute right-0 top-full mt-2 flex flex-col bg-[var(--background)] shadow-lg rounded z-50 min-w-[180px] max-h-[75dvh] overflow-y-auto">
          <Link href="/" onClick={() => setMenu(null)} className="px-4 py-2 hover:underline">Все обои</Link>
          <Link href="/category" onClick={() => setMenu(null)} className="px-4 py-2 hover:underline">Все категории</Link>
          {categories.map(category => <Link key={category.id} href={`/category/${encodeURIComponent(category.slug)}`} onClick={() => setMenu(null)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-neutral-700 whitespace-nowrap">{category.title}</Link>)}
          {loadingOptions && <p className="px-4 py-2" role="status">Загрузка…</p>}
          {optionsError && <button className="px-4 py-2 underline" onClick={() => setRevision(value => value + 1)}>Повторить загрузку</button>}
        </div>}
      </div>
      <div ref={filterDropdown} className="relative">
        <button ref={filterTrigger} className={buttonClass} onClick={toggleFilter} aria-expanded={filterOpen} aria-controls="desktop-catalog-filter">Фильтр</button>
        {filterOpen && <div id="desktop-catalog-filter" className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-48px)] max-h-[calc(100dvh-100px)] overflow-y-auto rounded-xl bg-[var(--background)] shadow-lg p-3">
          {renderFilter()}
        </div>}
      </div>
      <button onClick={openCart} className={`${buttonClass} relative flex items-center gap-2`}>
        <ShoppingCart size={18} /><span>Корзина</span>
        {hydrated && cartItems.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 items-center justify-center flex">{cartItems.length}</span>}
      </button>
      {hydrated && !loading && (user ? <div className="relative" onMouseEnter={() => openMenu('profile')} onMouseLeave={leaveMenu}>
        <button aria-label="Мой профиль" onClick={() => openMenu('profile')} aria-expanded={menu === 'profile'} className="rounded-full border p-2"><UserCircle2 size={20} /></button>
        {menu === 'profile' && <div className="absolute right-0 top-full mt-2 flex flex-col bg-[var(--background)] shadow-lg rounded min-w-max">
          <Link href="/account" onClick={() => setMenu(null)} className="px-4 py-2">Профиль</Link>
          <button onClick={logout} className="px-4 py-2 text-left">Выйти</button>
        </div>}
      </div> : <button onClick={() => { setFilterOpen(false); setAuthOpen(true); }} className={buttonClass}>Войти</button>)}
    </nav>
    <BurgerMenu categories={categories} locationKey={locationKey} backHref={backHref} restoreBackScroll={product && !!savedReturnTo}
      cartCount={hydrated ? cartItems.length : 0} user={user} authReady={hydrated && !loading} loadingCategories={loadingOptions}
      renderFilter={renderFilter} onCart={openCart} onLogin={() => setAuthOpen(true)} onLogout={logout} />
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
  </header>;
}
