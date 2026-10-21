// src/app/page.tsx

import { getWallpapers } from '@/lib/api'
import WallpaperCard from '@/components/WallpaperCard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const wallpapers = await getWallpapers()

  return (
    <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 bg-[var(--background)] text-[var(--foreground)]">
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
  )
}
