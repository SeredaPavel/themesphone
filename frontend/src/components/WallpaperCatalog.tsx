import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategories, getDevices, getWallpaperPage } from '@/lib/api';
import { catalogPageHref, catalogLocationFilters } from '@/lib/catalog-query';
import type { CatalogSearchParams } from '@/lib/catalog-query';
import { getWallpaperImageUrl } from '@/lib/wallpaper.server';
import WallpaperCard from './WallpaperCard';
import WallpaperPreviewGroup from './WallpaperPreviewGroup';
import CatalogScrollRestorer from './CatalogScrollRestorer';

export default async function WallpaperCatalog({ searchParams, category, device }: {
  searchParams: CatalogSearchParams;
  category?: string;
  device?: string;
}) {
  const [categories, devices] = await Promise.all([getCategories(), getDevices()]);
  const selectedCategory = categories.find(item => item.slug === category);
  const selectedDevice = devices.find(item => item.slug === device);
  if ((category && !selectedCategory) || (device && !selectedDevice)) notFound();
  const pathname = category ? `/category/${encodeURIComponent(category)}` : device ? `/device/${encodeURIComponent(device)}` : '/';
  const filters = catalogLocationFilters(pathname, searchParams);
  if ((filters.category && !categories.some(item => item.slug === filters.category)) ||
      (filters.device && !devices.some(item => item.slug === filters.device))) notFound();
  const { data, meta: { pagination } } = await getWallpaperPage(filters);
  const effectiveCategory = categories.find(item => item.slug === filters.category);
  const effectiveDevice = devices.find(item => item.slug === filters.device);
  const title = effectiveCategory ? `Обои: ${effectiveCategory.title}` : effectiveDevice ? `Обои для ${effectiveDevice.title}` : 'Каталог обоев';
  const returnTo = catalogPageHref(pathname, filters, filters.page);

  return (
    <section className="px-4 pb-6 sm:px-6 max-w-[1600px] mx-auto text-[var(--foreground)]">
      <CatalogScrollRestorer href={returnTo} />
      <h1 className="sr-only">{title}</h1>
      {data.length > 0 ? (
        <WallpaperPreviewGroup key={returnTo} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-5">
          {data.map(wallpaper => {
            const image = wallpaper.image?.find(item => !item.mime || item.mime.startsWith('image/'));
            const imageUrl = image ? getWallpaperImageUrl(image.formats?.medium?.url || image.formats?.small?.url || image.url) || '' : '';
            const price = Number(wallpaper.price);
            return <WallpaperCard key={wallpaper.documentId} id={wallpaper.id} documentId={wallpaper.documentId}
              returnTo={returnTo}
              title={wallpaper.title} imageUrl={imageUrl} isFree={wallpaper.isFree}
              price={Number.isFinite(price) && price >= 0 ? price : undefined}
              category={wallpaper.categories?.[0] || null} device={wallpaper.device || null} />;
          })}
        </WallpaperPreviewGroup>
      ) : (
        <div className="glass-panel p-6">
          <h2 className="text-xl font-bold mb-2">Обои не найдены</h2>
          <p>Выберите другую категорию или устройство в меню.</p>
          <Link href={pathname} className="inline-block mt-3 underline">Сбросить фильтры</Link>
          {filters.page > 1 && <Link className="inline-block mt-3 underline" href={catalogPageHref(pathname, filters, 1)}>Вернуться на первую страницу</Link>}
        </div>
      )}
      {pagination.pageCount > 1 && <nav aria-label="Страницы каталога" className="glass-panel p-4 mt-8 flex flex-wrap gap-4 items-center">
        {filters.page > 1 && <Link rel="prev" className="liquid-pill" href={catalogPageHref(pathname, filters, filters.page - 1)}>Предыдущая</Link>}
        <span>Страница {filters.page} из {pagination.pageCount}</span>
        {filters.page < pagination.pageCount && <Link rel="next" className="liquid-pill" href={catalogPageHref(pathname, filters, filters.page + 1)}>Следующая</Link>}
      </nav>}
    </section>
  );
}
