'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { TaxonomyItem } from '@/lib/api';
import { CATALOG_SORTS } from '@/lib/catalog-query';
import type { CatalogFilters } from '@/lib/catalog-query';

const tabs = [
  { id: 'category', title: 'Категории' },
  { id: 'device', title: 'Устройства' },
  { id: 'sort', title: 'Сортировка' },
  { id: 'search', title: 'Поиск по названию' },
] as const;

export default function CatalogFilterPanel({ initial, categories, devices, loading, error, onReload, onApply, onReset, onClose }: {
  initial: CatalogFilters; categories: TaxonomyItem[]; devices: TaxonomyItem[];
  loading: boolean; error: boolean; onReload: () => void;
  onApply: (filters: CatalogFilters) => void; onReset: () => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [active, setActive] = useState<(typeof tabs)[number]['id']>('category');
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('[role="tab"]')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex="0"]') || [])
      .filter(element => element.getClientRects().length > 0 && element.tabIndex >= 0);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  function submit(event: FormEvent) { event.preventDefault(); onApply({ ...draft, q: draft.q.trim(), page: 1 }); }
  const choiceClass = 'flex items-center gap-3 rounded-xl border border-[var(--foreground)]/30 px-4 py-3 cursor-pointer';

  return <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 sm:p-6" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={onKeyDown}
      className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl border bg-[var(--background)] text-[var(--foreground)] shadow-xl">
      <div className="flex justify-between items-center gap-4 p-5">
        <h2 id={`${id}-title`} className="text-xl font-bold">Фильтр обоев</h2>
        <button type="button" aria-label="Закрыть фильтр" onClick={onClose} className="rounded-full border px-3 py-1">✕</button>
      </div>
      <div role="tablist" aria-label="Условия фильтра" className="flex flex-wrap gap-2 px-5 pb-4 shrink-0">
        {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`}
          aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
          onClick={() => setActive(tab.id)} onKeyDown={event => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault(); setActive(tabs[next].id);
            document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
          }} className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${active === tab.id ? 'bg-[var(--foreground)] text-[var(--background)]' : ''}`}>{tab.title}</button>)}
      </div>
      <form onSubmit={submit} className="flex flex-col min-h-0">
        <div className="px-5 pb-5 overflow-y-auto min-h-[180px]">
          {loading && <p role="status">Загрузка условий…</p>}
          {error && <div role="alert" className="mb-4"><p>Не удалось загрузить категории и устройства.</p><button type="button" onClick={onReload} className="underline mt-2">Повторить</button></div>}
          <div role="tabpanel" id={`${id}-panel-category`} aria-labelledby={`${id}-tab-category`} hidden={active !== 'category'}>
            <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="sr-only">Категория</legend>
              {[{ slug: '', title: 'Все категории' }, ...categories].map(item => <label key={item.slug} className={choiceClass}>
                <input type="radio" name="category" value={item.slug} checked={draft.category === item.slug} onChange={() => setDraft({ ...draft, category: item.slug })} />{item.title}
              </label>)}
            </fieldset>
          </div>
          <div role="tabpanel" id={`${id}-panel-device`} aria-labelledby={`${id}-tab-device`} hidden={active !== 'device'}>
            <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="sr-only">Устройство</legend>
              {[{ slug: '', title: 'Все устройства' }, ...devices].map(item => <label key={item.slug} className={choiceClass}>
                <input type="radio" name="device" value={item.slug} checked={draft.device === item.slug} onChange={() => setDraft({ ...draft, device: item.slug })} />{item.title}
              </label>)}
            </fieldset>
          </div>
          <div role="tabpanel" id={`${id}-panel-sort`} aria-labelledby={`${id}-tab-sort`} hidden={active !== 'sort'}>
            <fieldset className="grid gap-2"><legend className="sr-only">Сортировка</legend>
              {Object.entries(CATALOG_SORTS).map(([value, option]) => <label key={value} className={choiceClass}>
                <input type="radio" name="sort" value={value} checked={draft.sort === value} onChange={() => setDraft({ ...draft, sort: value as CatalogFilters['sort'] })} />{option.label}
              </label>)}
            </fieldset>
          </div>
          <div role="tabpanel" id={`${id}-panel-search`} aria-labelledby={`${id}-tab-search`} hidden={active !== 'search'}>
            <label className="block">Поиск по названию
              <input type="search" maxLength={100} value={draft.q} onChange={event => setDraft({ ...draft, q: event.target.value })}
                placeholder="Введите название обоев" className="mt-3 w-full rounded-xl border bg-[var(--background)] px-4 py-3" />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 border-t p-5 shrink-0">
          <button type="submit" disabled={loading || error} className="rounded-full border px-5 py-2 bg-[var(--foreground)] text-[var(--background)] disabled:opacity-50">Применить</button>
          <button type="button" onClick={onReset} className="rounded-full border px-5 py-2">Сбросить фильтр</button>
        </div>
      </form>
    </div>
  </div>;
}
