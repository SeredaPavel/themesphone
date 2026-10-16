// src/app/auth/callback/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUserFromToken } from '@/lib/auth'
import { useAuthContext } from '@/context/AuthContext'

export default function AuthCallbackPage() {
  const router = useRouter()
  const { setUser } = useAuthContext()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('access_token')

    if (!token) {
      console.warn('Нет access_token в callback')
      router.replace('/')
      return
    }

    // ✅ сохраняем token в localStorage для клиента
    localStorage.setItem('token', token)

    // ✅ отправляем токен на сервер для установки HttpOnly cookie
    fetch('/api/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(() => getUserFromToken(token))
      .then((user) => {
        if (user) setUser(user)
        router.replace('/')
      })
      .catch((err) => {
        console.error('Ошибка при получении пользователя:', err)
        router.replace('/')
      })
  }, [router, setUser])

  return <p className="p-4 text-center">Вход в аккаунт...</p>
}
