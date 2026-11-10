import WallpaperCatalog from '@/components/WallpaperCatalog';
import type { CatalogSearchParams } from '@/lib/catalog-query';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  return <WallpaperCatalog searchParams={await searchParams} />;
}
