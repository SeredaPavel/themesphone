// 📄 src/app/account/TopWallpapersBanner.tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import WallpaperCard from '@/components/WallpaperCard'

type Wallpaper = {
  id: number
  title: string
  imageUrl: string
  isFree: boolean
  price?: number
  device?: { title: string; slug: string } | null
  category?: { title: string; slug: string } | null
}

export default function TopWallpapersBanner() {
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    startAutoScroll()
    return stopAutoScroll
  }, [])

  const startAutoScroll = () => {
    intervalRef.current = setInterval(() => {
      scrollRef.current?.scrollBy({ left: 140, behavior: 'smooth' })
    }, 3000)
  }

  const stopAutoScroll = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  useEffect(() => {
    async function fetchTopWallpapers() {
      try {
        const res = await fetch('/api/top-wallpapers')
        const json = await res.json()

        const data = Array.isArray(json.data)
          ? json.data.map((item: any) => {
              const imageUrl = item.image?.[0]?.url
                ? `${process.env.NEXT_PUBLIC_STRAPI_URL}${item.image[0].url}`
                : undefined
              if (!imageUrl || !item.title) return null

              return {
                id: item.id,
                title: item.title,
                imageUrl,
                isFree: item.isFree,
                price: typeof item.price === 'number'
                  ? item.price
                  : item.price && !isNaN(Number(item.price))
                  ? Number(item.price)
                  : undefined,
                device: item.device
                  ? { title: item.device.title, slug: item.device.slug }
                  : null,
                category: item.categories?.[0]
                  ? { title: item.categories[0].title, slug: item.categories[0].slug }
                  : null,
              }
            }).filter(Boolean) as Wallpaper[]
          : []

        setWallpapers(data)
      } catch (err) {
        console.error('❌ Ошибка загрузки топов:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTopWallpapers()
  }, [])

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -140, behavior: 'smooth' })
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 140, behavior: 'smooth' })

  if (loading || wallpapers.length === 0) return null

  return (
    <section className="relative border border-[var(--foreground)] rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-lg font-bold">🔥 Топ за неделю</h2>
        <Link
          href="/category/top"
          className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
        >
          Смотреть все
        </Link>
      </div>

      <div className="relative">
        {/* Кнопки — только на >= sm экранах */}
        <button
          onClick={scrollLeft}
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-[var(--background)] border border-[var(--foreground)] rounded-full w-8 h-8 items-center justify-center hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={scrollRight}
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-[var(--background)] border border-[var(--foreground)] rounded-full w-8 h-8 items-center justify-center hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div
          ref={scrollRef}
          className="px-2 sm:ml-10 sm:mr-10 sm:max-w-[720px] max-w-full w-full flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth"
          onMouseEnter={stopAutoScroll}
          onMouseLeave={startAutoScroll}
        >
          {wallpapers.map((wp) => (
            <div key={wp.id} className="shrink-0 w-[130px]">
              <WallpaperCard
                id={wp.id}
                title={wp.title}
                imageUrl={wp.imageUrl}
                isFree={wp.isFree}
                price={wp.price}
                device={wp.device}
                category={wp.category}
                compact={true}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
