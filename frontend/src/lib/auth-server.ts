// src/lib/auth-server.ts
import { cookies } from 'next/headers'

export async function getTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies() // ✅ теперь корректно
  const token = cookieStore.get('token')?.value
  return token || null
}

export async function getUserFromServerCookies() {
  const token = await getTokenFromCookies()
  if (!token) return null

  try {
    const res = await fetch(`${process.env.STRAPI_API_URL || process.env.NEXT_PUBLIC_STRAPI_URL}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.error('Ошибка получения пользователя на сервере:', err)
    return null
  }
}
