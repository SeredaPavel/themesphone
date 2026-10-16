// src/app/api/auth/google/callback/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('access_token')

  if (!token) {
    return NextResponse.redirect('/login?error=missing_token')
  }

  const res = NextResponse.redirect('/')
  res.cookies.set('token', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
  })

  return res
}
