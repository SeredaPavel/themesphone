'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { TaxonomyItem } from '@/lib/api';
import CatalogBackLink from './CatalogBackLink';

export default function BurgerMenu({ categories, locationKey, backHref, restoreBackScroll, cartCount, user, authReady, loadingCategories, onFilter, onCart, onLogin, onLogout }: {
  categories: TaxonomyItem[]; locationKey: string; backHref?: string; restoreBackScroll: boolean;
  cartCount: number; user: { username: string } | null; authReady: boolean; loadingCategories: boolean;
  onFilter: () => void; onCart: () => void; onLogin: () => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [locationKey]);
  const act = (action: () => void) => { setOpen(false); action(); };
  return <div className="md:hidden relative z-50">
    <button onClick={() => setOpen(!open)} aria-label={open ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={open} aria-controls="mobile-navigation" className="p-1">
      {open ? <X size={28} /> : <Menu size={28} />}
    </button>
    {open && <nav id="mobile-navigation" aria-label="Мобильное меню" className="absolute top-full right-0 mt-2 w-64 max-h-[calc(100dvh-90px)] overflow-y-auto rounded-xl border bg-[var(--background)] shadow-lg p-4 space-y-4">
      {backHref && <CatalogBackLink href={backHref} restoreScroll={restoreBackScroll} onNavigate={() => setOpen(false)} className="block underline" />}
      <details>
        <summary className="cursor-pointer font-semibold">Категории</summary>
        <div className="flex flex-col gap-2 mt-3">
          <Link href="/" onClick={() => setOpen(false)}>Все обои</Link>
          <Link href="/category" onClick={() => setOpen(false)}>Все категории</Link>
          {categories.map(category => <Link key={category.id} href={`/category/${encodeURIComponent(category.slug)}`} onClick={() => setOpen(false)}>{category.title}</Link>)}
          {loadingCategories && <p role="status">Загрузка…</p>}
        </div>
      </details>
      <button onClick={() => act(onFilter)} className="block font-semibold" aria-haspopup="dialog">Фильтр</button>
      <button onClick={() => act(onCart)} className="block font-semibold">Корзина{cartCount > 0 ? ` (${cartCount})` : ''}</button>
      {authReady && (user ? <div className="border-t pt-3 space-y-3">
        <Link href="/account" onClick={() => setOpen(false)} className="block">Профиль</Link>
        <button onClick={() => act(onLogout)}>Выйти</button>
      </div> : <button onClick={() => act(onLogin)} className="block">Войти</button>)}
    </nav>}
  </div>;
}
