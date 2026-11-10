import WallpaperCatalog from '@/components/WallpaperCatalog';
import type { CatalogSearchParams } from '@/lib/catalog-query';

export const dynamic = 'force-dynamic';

export default async function CategoryPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <WallpaperCatalog category={(await params).slug} searchParams={await searchParams} />;
}
