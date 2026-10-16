// 📄 src/app/api/top-wallpapers/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const STRAPI_URL = process.env.STRAPI_API_URL || 'http://127.0.0.1:1337'
  const TOKEN = process.env.STRAPI_API_TOKEN

  if (!TOKEN) {
    return NextResponse.json({ error: 'STRAPI_API_TOKEN is missing' }, { status: 500 })
  }

  const res = await fetch(
    `${STRAPI_URL}/api/wallpapers?filters[downloads][$gt]=0&sort=downloads:desc&pagination[limit]=15&populate=image&populate=categories&populate=device`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
      cache: 'no-store',
    }
  )

  const data = await res.json()
  return NextResponse.json(data)
}
