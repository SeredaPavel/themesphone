// src/app/api/connect/google/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337'}/api/connect/google`
  )
}
