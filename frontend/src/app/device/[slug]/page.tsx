import WallpaperCatalog from '@/components/WallpaperCatalog';
import type { CatalogSearchParams } from '@/lib/catalog-query';

export const dynamic = 'force-dynamic';

export default async function DevicePage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <WallpaperCatalog device={(await params).slug} searchParams={await searchParams} />;
}
