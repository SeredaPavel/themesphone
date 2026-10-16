// 📄 src/components/FilterDropdown.tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

type Props = {
  title: string
  paramKey: 'category' | 'device'
  options: { id: number; title: string; slug: string }[]
}

export default function FilterDropdown({ title, paramKey, options }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const current = searchParams.get(paramKey)
    if (current) setSelected(current)
  }, [searchParams, paramKey])

  // 👇 Проверяем: если мы уже на странице с этим фильтром, НЕ отображаем блок
  const isOnFilterPage = () => {
    if (paramKey === 'category' && pathname.startsWith('/category/')) return true
    if (paramKey === 'device' && pathname.startsWith('/device/')) return true
    return false
  }

  if (isOnFilterPage()) return null // ⛔️ ничего не рендерим

  const handleSelect = (slug: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (slug === selected) {
      newParams.delete(paramKey)
      setSelected(null)
    } else {
      newParams.set(paramKey, slug)
      setSelected(slug)
    }
    router.push(`${pathname}?${newParams.toString()}`)
  }

  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-1">{title}</div>
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const isActive = selected === option.slug
          return (
            <button
              key={option.slug}
              onClick={() => handleSelect(option.slug)}
              className={`text-sm px-3 py-1 rounded-full border transition whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)]'
              }`}
            >
              {option.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}
