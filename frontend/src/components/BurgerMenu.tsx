// src/components/BurgerMenu.tsx

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getCategories, getDevices } from '@/lib/api'
import { Menu, X, ShoppingCart, UserCircle2 } from 'lucide-react'
import { useAuthContext } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useRouter } from 'next/navigation'
import AuthModal from './AuthModal'

export default function BurgerMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [isAuthOpen, setIsAuthOpen] = useState(false)

  const { user, setUser, loading } = useAuthContext()
  const { cartItems } = useCart()
  const router = useRouter()

  useEffect(() => {
    getCategories().then(setCategories).catch(console.error)
    getDevices().then(setDevices).catch(console.error)
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('token')
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    setUser(null)
    setIsOpen(false)
    router.refresh()
  }

  const handleCartClick = () => {
    if (!user) {
      setIsAuthOpen(true)
      return
    }
    router.push('/cart')
    setIsOpen(false)
  }

  return (
    <div className="sm:hidden relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-[var(--foreground)] focus:outline-none"
      >
        {isOpen ? <X size={28} /> : <Menu size={28} />}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-[var(--background)] text-[var(--foreground)] shadow-lg rounded-md p-4 space-y-4">
          <div>
            <p className="font-semibold mb-1">Категории</p>
            <div className="space-y-1">
              {categories.map(cat => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug ?? cat.id}`}
                  className="block hover:underline"
                  onClick={() => setIsOpen(false)}
                >
                  {cat.title}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="font-semibold mb-1">Устройства</p>
            <div className="space-y-1">
              {devices.map(dev => (
                <Link
                  key={dev.id}
                  href={`/device/${dev.slug ?? dev.id}`}
                  className="block hover:underline"
                  onClick={() => setIsOpen(false)}
                >
                  {dev.title}
                </Link>
              ))}
            </div>
          </div>

          <button
            onClick={handleCartClick}
            className="flex items-center gap-2 font-semibold hover:underline w-full"
          >
            <ShoppingCart size={20} />
            <span>Корзина</span>
            {cartItems.length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {cartItems.length}
              </span>
            )}
          </button>

          {!loading && (
            user ? (
              <div className="pt-4 border-t border-gray-300 dark:border-neutral-700 space-y-2">
                <p className="flex items-center gap-2 font-semibold">
                  <UserCircle2 size={20} />
                  <span>{user.username}</span>
                </p>
                <Link href="/account" onClick={() => setIsOpen(false)} className="block hover:underline">
                  Профиль
                </Link>
                <button onClick={handleLogout} className="block text-left hover:underline w-full">
                  Выйти
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsAuthOpen(true)
                  setIsOpen(false)
                }}
                className="mt-4 w-full text-left font-semibold hover:underline"
              >
                Войти
              </button>
            )
          )}

          <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
        </div>
      )}
    </div>
  )
}
