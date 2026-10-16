// ✅ src/app/api/auth/email-confirmation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { serialize } from 'cookie'

export async function POST(req: NextRequest) {
  const { confirmation } = await req.json()

  if (!confirmation) {
    return NextResponse.json({ error: 'Missing confirmation token' }, { status: 400 })
  }

  try {
    const strapiRes = await fetch(`${process.env.NEXT_PUBLIC_STRAPI_URL}/api/auth/email-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    })

    const data = await strapiRes.json()

    if (!strapiRes.ok || !data.jwt) {
      return NextResponse.json({ error: 'Invalid token or server error', details: data }, { status: 401 })
    }

    // ✅ Устанавливаем cookie вручную через заголовок Set-Cookie
    const res = NextResponse.json({ user: data.user })

    const cookie = serialize('token', data.jwt, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 дней
    })

    res.headers.set('Set-Cookie', cookie)

    return res
  } catch (err) {
    console.error('❌ Ошибка подтверждения:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
