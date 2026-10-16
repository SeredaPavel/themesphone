// src/app/api/set-token/route.ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { token } = await req.json()

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 400 })
  }

  const cookieStore = await cookies() // ✅ добавлен await
  cookieStore.set('token', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: false, // на localhost можно оставить false, на проде — true
    maxAge: 60 * 60 * 24 * 7, // 7 дней
  })

  return NextResponse.json({ ok: true })
}
