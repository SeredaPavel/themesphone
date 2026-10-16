// src/app/api/connect/google/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.redirect(
    'http://localhost:1337/api/connect/google'
  )
}
