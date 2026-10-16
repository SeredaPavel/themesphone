// 📄 src/app/device/[slug]/page.tsx
import { getWallpapers } from '@/lib/api'
import WallpaperCard from '@/components/WallpaperCard'

type Props = {
  params: { slug: string }
  searchParams: { category?: string }
}

export default async function DevicePage({ params, searchParams }: Props) {
  const { slug } = params
  const wallpapers = await getWallpapers({ device: slug, category: searchParams.category })

  return (
    <div className="p-6 bg-[var(--background)] text-[var(--foreground)]">
      {(!wallpapers || wallpapers.length === 0) ? (
        <div className="text-center py-10">
          <h2 className="text-3xl font-bold">Нет обоев</h2>
          <p className="text-gray-500 mt-2">Для этого устройства пока нет обоев.</p>
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

export async function generateStaticParams() {
  const res = await fetch('http://127.0.0.1:1337/api/devices?fields[0]=slug')
  const data = await res.json()

  const devices = data?.data || []

  return devices
    .filter((item: any) => item?.attributes?.slug)
    .map((item: any) => ({
      slug: item.attributes.slug,
    }))
}
