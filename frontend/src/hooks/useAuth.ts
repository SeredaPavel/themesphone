// src/hooks/useAuth.ts
'use client'

import { useEffect, useState } from 'react'

type User = {
  id: number
  username: string
  email: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function getTokenFromCookie(): string | null {
      if (typeof document === 'undefined') return null
      const match = document.cookie.match(/(?:^| )token=([^;]+)/)
      return match ? match[1] : null
    }

    async function fetchUser() {
      const token = getTokenFromCookie()
      console.log('[useAuth] Отправляем токен из cookie:', token)

      if (!token) {
        console.log('[useAuth] Токен не найден')
        setUser(null)
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        console.log('[useAuth] Ответ от /api/me:', res.status)

        if (!res.ok) {
          const errText = await res.text()
          console.error('[useAuth] Ошибка от /api/me:', errText)
          setUser(null)
        } else {
          const data = await res.json()
          console.log('[useAuth] Данные пользователя:', data)
          setUser(data)
        }
      } catch (err) {
        console.error('[useAuth] Ошибка при запросе:', err)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return {
    user,
    loading,
    setUser,
    isAuthenticated: !!user,
  }
}
