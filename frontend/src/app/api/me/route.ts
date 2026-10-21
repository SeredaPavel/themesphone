// src/app/api/me/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // 1. Читаем токен из заголовка
  let token = req.headers.get('authorization')?.replace('Bearer ', '')

  // 2. Если не найден — читаем из cookie
  if (!token) {
    const cookieToken = req.cookies.get('token')
    token = cookieToken?.value
  }

  // 3. Если всё ещё нет — ошибка
  if (!token) {
    return NextResponse.json({ error: 'No token' }, { status: 401 })
  }

  const res = await fetch(`${process.env.STRAPI_API_URL || process.env.NEXT_PUBLIC_STRAPI_URL}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await res.json()
  return NextResponse.json(user)
}
