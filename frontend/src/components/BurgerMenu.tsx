'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import type { TaxonomyItem } from '@/lib/api';
import CatalogBackLink from './CatalogBackLink';

function MobileMenuSection({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  return <div>
    <button type="button" className="liquid-pill w-full !justify-between" aria-expanded={expanded}
      aria-controls={contentId} onClick={() => setExpanded(value => !value)}>
      {title}<ChevronDown size={16} className={`disclosure-chevron ${expanded ? 'rotate-180' : ''}`} />
    </button>
    <div id={contentId} hidden={!expanded}>{children}</div>
  </div>;
}

export default function BurgerMenu({ categories, locationKey, backHref, restoreBackScroll, cartCount, user, authReady, loadingCategories, renderFilter, onCart, onLogin, onLogout }: {
  categories: TaxonomyItem[]; locationKey: string; backHref?: string; restoreBackScroll: boolean;
  cartCount: number; user: { username: string } | null; authReady: boolean; loadingCategories: boolean;
  renderFilter: (close: () => void) => ReactNode; onCart: () => void; onLogin: () => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [locationKey]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const act = (action: () => void) => { setOpen(false); action(); };
  return <div ref={container} className="md:hidden relative z-50">
    <button ref={trigger} type="button" onClick={() => setOpen(value => !value)} aria-label={open ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={open} aria-controls="mobile-navigation" className="liquid-pill !p-3">
      {open ? <X size={22} /> : <Menu size={22} />}
    </button>
    {open && <nav id="mobile-navigation" aria-label="Мобильное меню" className="glass-panel absolute top-full right-0 mt-3 w-72 max-w-[calc(100vw-40px)] max-h-[calc(100dvh-110px)] overflow-y-auto p-3 space-y-2">
      {backHref && <CatalogBackLink href={backHref} restoreScroll={restoreBackScroll} onNavigate={() => setOpen(false)} className="liquid-pill w-full !justify-start" />}
      <MobileMenuSection title="Категории">
        <div className="menu-stack mt-2 pl-2">
          <Link href="/" className="liquid-pill" onClick={() => setOpen(false)}>Все обои</Link>
          <Link href="/category" className="liquid-pill" onClick={() => setOpen(false)}>Все категории</Link>
          {categories.map(category => <Link key={category.id} className="liquid-pill" href={`/category/${encodeURIComponent(category.slug)}`} onClick={() => setOpen(false)}>{category.title}</Link>)}
          {loadingCategories && <p role="status">Загрузка…</p>}
        </div>
      </MobileMenuSection>
      <MobileMenuSection title="Фильтр">
        <div className="mt-3 pb-2">{renderFilter(() => setOpen(false))}</div>
      </MobileMenuSection>
      <button onClick={() => act(onCart)} className="liquid-pill w-full !justify-start">Корзина{cartCount > 0 ? ` (${cartCount})` : ''}</button>
      {authReady && (user ? <div className="border-t pt-3 space-y-3">
        <Link href="/account" onClick={() => setOpen(false)} className="liquid-pill w-full !justify-start">Профиль</Link>
        <button onClick={() => act(onLogout)} className="liquid-pill w-full !justify-start">Выйти</button>
      </div> : <button onClick={() => act(onLogin)} className="liquid-pill liquid-pill--accent w-full">Войти</button>)}
    </nav>}
  </div>;
}
