// src/app/api/download/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fileUrl = searchParams.get('url')
  const filename = searchParams.get('name') || 'wallpaper.jpg'

  if (!fileUrl) {
    return new NextResponse('Missing image URL', { status: 400 })
  }

  try {
    const res = await fetch(fileUrl)

    if (!res.ok) {
      return new NextResponse('Failed to fetch image', { status: 500 })
    }

    const arrayBuffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'application/octet-stream'

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
