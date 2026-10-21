// 📄 src/app/category/[slug]/page.tsx
import { getWallpapers } from '@/lib/api'
import WallpaperCard from '@/components/WallpaperCard'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ device?: string }>
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { device } = await searchParams
  const wallpapers = await getWallpapers({ category: slug, device })

  return (
    <div className="p-6 bg-[var(--background)] text-[var(--foreground)]">
      {(!wallpapers || wallpapers.length === 0) ? (
        <div className="text-center py-10">
          <h2 className="text-3xl font-bold">Нет обоев</h2>
          <p className="text-gray-500 mt-2">В этой категории пока нет обоев.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {wallpapers.map((wallpaper: any) => {
            const image = wallpaper.image?.[0]
            const imageUrl = image?.formats?.medium?.url || image?.url

            return (
              <WallpaperCard
                key={wallpaper.id}
                id={wallpaper.id}
                title={wallpaper.title}
                imageUrl={`${process.env.NEXT_PUBLIC_STRAPI_URL}${imageUrl}`}
                isFree={wallpaper.isFree}
                price={wallpaper.price}
                category={wallpaper.categories?.[0] ?? null}
                device={wallpaper.device ?? null}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
