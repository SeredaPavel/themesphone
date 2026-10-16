// 📄 src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()

  cookieStore.set('token', '', {
    httpOnly: true,
    path: '/',
    expires: new Date(0), // Установим истёкшую дату
  })

  return NextResponse.json({ success: true })
}
