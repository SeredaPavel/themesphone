// ✅ src/app/api/connect/yandex/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.redirect(
    'http://localhost:1337/api/connect/yandex'
  )
}
