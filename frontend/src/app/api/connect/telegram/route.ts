// src/app/api/connect/telegram/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const strapiURL = process.env.NEXT_PUBLIC_STRAPI_URL
  const redirect = 'http://localhost:3000/auth/callback'
  return NextResponse.redirect(`${strapiURL}/api/connect/telegram?redirect=${redirect}`)
}
