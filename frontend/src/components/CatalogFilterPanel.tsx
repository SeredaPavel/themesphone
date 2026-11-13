'use client';

import { useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import type { TaxonomyItem } from '@/lib/api';
import { CATALOG_SORTS } from '@/lib/catalog-query';
import type { CatalogFilters } from '@/lib/catalog-query';

export default function CatalogFilterPanel({ initial, categories, devices, loading, error, onReload, onApply, onReset }: {
  initial: CatalogFilters; categories: TaxonomyItem[]; devices: TaxonomyItem[];
  loading: boolean; error: boolean; onReload: () => void;
  onApply: (filters: CatalogFilters) => void; onReset: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  function submit(event: FormEvent) { event.preventDefault(); onApply({ ...draft, q: draft.q.trim(), page: 1 }); }
  function collapseSelection(event: MouseEvent<HTMLInputElement>) {
    const section = event.currentTarget.closest('details');
    if (!section) return;
    section.open = false;
    section.querySelector('summary')?.focus();
  }
  const fieldClass = (active: boolean) => `liquid-pill filter-field ${active ? 'is-selected' : ''}`;
  const choiceClass = (active: boolean) => `filter-choice ${active ? 'is-selected' : ''}`;
  const summaryClass = (active: boolean) => `${fieldClass(active)} flex items-center justify-between gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden`;
  const chevron = <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 disclosure-chevron"><path d="m6 9 6 6 6-6" /></svg>;
  const categoryTitle = categories.find(item => item.slug === draft.category)?.title;
  const deviceTitle = devices.find(item => item.slug === draft.device)?.title;

  return <form onSubmit={submit} aria-label="Фильтр обоев" className="catalog-filter text-sm">
    {loading && <p role="status" className="py-2">Загрузка условий…</p>}
    {error && <div role="alert" className="py-2"><p>Не удалось загрузить условия.</p><button type="button" onClick={onReload} className="underline mt-2">Повторить</button></div>}
    <details className="filter-section soft-disclosure mb-2">
      <summary className={summaryClass(!!draft.category)}><span>{categoryTitle ? `Категории: ${categoryTitle}` : 'Категории'}</span>{chevron}</summary>
      <fieldset className="pt-2"><legend className="sr-only">Категория</legend>
        {[{ slug: '', title: 'Все категории' }, ...categories].map(item => <label key={item.slug} className={choiceClass(draft.category === item.slug)}>
          <input type="radio" name="category" value={item.slug} checked={draft.category === item.slug} onClick={collapseSelection} onChange={() => setDraft({ ...draft, category: item.slug })} />{item.title}
        </label>)}
      </fieldset>
    </details>
    <details className="filter-section soft-disclosure mb-2">
      <summary className={summaryClass(!!draft.device)}><span>{deviceTitle ? `Устройства: ${deviceTitle}` : 'Устройства'}</span>{chevron}</summary>
      <fieldset className="pt-2"><legend className="sr-only">Устройство</legend>
        {[{ slug: '', title: 'Все устройства' }, ...devices].map(item => <label key={item.slug} className={choiceClass(draft.device === item.slug)}>
          <input type="radio" name="device" value={item.slug} checked={draft.device === item.slug} onClick={collapseSelection} onChange={() => setDraft({ ...draft, device: item.slug })} />{item.title}
        </label>)}
      </fieldset>
    </details>
    <details className="filter-section soft-disclosure mb-2">
      <summary className={summaryClass(draft.sort !== 'default')}><span>{draft.sort !== 'default' ? CATALOG_SORTS[draft.sort].label : 'Сортировка'}</span>{chevron}</summary>
      <fieldset className="pt-2"><legend className="sr-only">Сортировка</legend>
        {Object.entries(CATALOG_SORTS).map(([value, option]) => <label key={value} className={choiceClass(draft.sort === value)}>
          <input type="radio" name="sort" value={value} checked={draft.sort === value} onClick={collapseSelection} onChange={() => setDraft({ ...draft, sort: value as CatalogFilters['sort'] })} />{option.label}
        </label>)}
      </fieldset>
    </details>
      <label className="block"><span className="sr-only">Поиск по названию</span>
        <input type="search" maxLength={100} value={draft.q} onChange={event => setDraft({ ...draft, q: event.target.value })}
          placeholder="Поиск по названию" className={`${fieldClass(!!draft.q.trim())} filter-search`} />
      </label>
    <div className="catalog-filter-actions">
      <button type="submit" disabled={loading || error} className="liquid-pill liquid-pill--accent">Применить</button>
      <button type="button" onClick={onReset} className="liquid-pill">Сбросить фильтр</button>
    </div>
  </form>;
}
