// src/components/Header.tsx

'use client'

import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { getCategories, getDevices } from '@/lib/api'
import BurgerMenu from './BurgerMenu'
import { ShoppingCart, UserCircle2 } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useAuthContext } from '@/context/AuthContext'
import AuthModal from './AuthModal'

export default function Header() {
  const [categories, setCategories] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [hoveredMenu, setHoveredMenu] = useState<null | 'categories' | 'devices' | 'profile'>(null)
  const [hoveredFilterMenu, setHoveredFilterMenu] = useState<null | 'category' | 'device'>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const filterTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)

  const { cartItems } = useCart()
  const { user, setUser, loading } = useAuthContext()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    getCategories().then(setCategories).catch(console.error)
    getDevices().then(setDevices).catch(console.error)
  }, [])

  useEffect(() => {
    if (searchParams.get('auth') === 'popup') {
      setIsAuthOpen(true)
    }
  }, [searchParams])

  const handleMouseEnter = (menu: 'categories' | 'devices' | 'profile') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setHoveredMenu(menu)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setHoveredMenu(null)
    }, 250)
  }

  const handleFilterEnter = (menu: 'category' | 'device') => {
    if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current)
    setHoveredFilterMenu(menu)
  }

  const handleFilterLeave = () => {
    filterTimeoutRef.current = setTimeout(() => {
      setHoveredFilterMenu(null)
    }, 250)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('token')
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    setUser(null)
    router.refresh()
  }

  const handleCartClick = () => {
    if (!user) {
      setIsAuthOpen(true)
      return
    }
    router.push('/cart')
  }

  const navigateToCategory = (slug: string) => {
    router.push(`/category/${slug}`)
    setHoveredMenu(null)
  }

  const navigateToDevice = (slug: string) => {
    router.push(`/device/${slug}`)
    setHoveredMenu(null)
  }

  const handleFilter = (type: 'device' | 'category', slug: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set(type, slug)
    router.push(`${pathname}?${current.toString()}`)
  }

  return (
    <header className="w-full py-4 px-6 bg-[var(--background)] text-[var(--foreground)] shadow-md flex justify-between items-center z-50 relative">
      <h1 className="text-2xl font-bold">
        <Link href="/">ThemesPhone</Link>
      </h1>

      {/* Десктопное меню */}
      <nav className="hidden sm:flex gap-4 text-sm relative items-center">

        {/* 🔄 Умный фильтр — по устройству */}
        {pathname.startsWith('/category/') && (
          <div
            className="relative"
            onMouseEnter={() => handleFilterEnter('device')}
            onMouseLeave={handleFilterLeave}
          >
            <button className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition">
              Фильтр по устройству
            </button>
            {hoveredFilterMenu === 'device' && (
              <div className="absolute left-0 top-full mt-2 flex flex-col bg-[var(--background)] text-[var(--foreground)] shadow-lg rounded z-50 min-w-max">
                {devices.map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => handleFilter('device', dev.slug ?? dev.id)}
                    className="px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-neutral-700 whitespace-nowrap"
                  >
                    {dev.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 🔄 Умный фильтр — по категории */}
        {pathname.startsWith('/device/') && (
          <div
            className="relative"
            onMouseEnter={() => handleFilterEnter('category')}
            onMouseLeave={handleFilterLeave}
          >
            <button className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition">
              Фильтр по категории
            </button>
            {hoveredFilterMenu === 'category' && (
              <div className="absolute left-0 top-full mt-2 flex flex-col bg-[var(--background)] text-[var(--foreground)] shadow-lg rounded z-50 min-w-max">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleFilter('category', cat.slug ?? cat.id)}
                    className="px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-neutral-700 whitespace-nowrap"
                  >
                    {cat.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Основная навигация */}
        <div className="relative" onMouseEnter={() => handleMouseEnter('categories')} onMouseLeave={handleMouseLeave}>
          <button className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition">
            Категории
          </button>
          {hoveredMenu === 'categories' && (
            <div className="absolute left-0 top-full mt-2 flex flex-col bg-[var(--background)] text-[var(--foreground)] shadow-lg rounded z-50 min-w-max">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => navigateToCategory(cat.slug ?? cat.id)}
                  className="px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-neutral-700 whitespace-nowrap"
                >
                  {cat.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" onMouseEnter={() => handleMouseEnter('devices')} onMouseLeave={handleMouseLeave}>
          <button className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition">
            Устройства
          </button>
          {hoveredMenu === 'devices' && (
            <div className="absolute left-0 top-full mt-2 flex flex-col bg-[var(--background)] text-[var(--foreground)] shadow-lg rounded z-50 min-w-max">
              {devices.map(dev => (
                <button
                  key={dev.id}
                  onClick={() => navigateToDevice(dev.slug ?? dev.id)}
                  className="px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-neutral-700 whitespace-nowrap"
                >
                  {dev.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleCartClick}
          className="relative flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
        >
          <ShoppingCart size={18} />
          <span>Корзина</span>
          {cartItems.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {cartItems.length}
            </span>
          )}
        </button>

        {!loading && (
          user ? (
            <div className="relative" onMouseEnter={() => handleMouseEnter('profile')} onMouseLeave={handleMouseLeave}>
              <button className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition">
                <UserCircle2 size={20} />
              </button>
              {hoveredMenu === 'profile' && (
                <div className="absolute right-0 top-full mt-2 flex flex-col bg-[var(--background)] text-[var(--foreground)] shadow-lg rounded z-50 min-w-max">
                  <Link href="/account" className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-neutral-700 whitespace-nowrap">Профиль</Link>
                  <button onClick={handleLogout} className="text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-neutral-700 whitespace-nowrap">Выйти</button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setIsAuthOpen(true)} className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition">
              Войти
            </button>
          )
        )}
      </nav>

      {/* 📱 Мобильное меню */}
      <BurgerMenu />

      {/* 🔐 Модалка входа */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </header>
  )
}
