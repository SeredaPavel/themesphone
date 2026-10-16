// src/app/api/register/route.ts

import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    const STRAPI_API_URL = process.env.STRAPI_API_URL
    if (!STRAPI_API_URL) {
      return NextResponse.json({ error: 'Missing STRAPI_API_URL env var' }, { status: 500 })
    }

    const res = await fetch(`${STRAPI_API_URL}/api/auth/local/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: email,
        email,
        password,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message || 'Registration error' }, { status: res.status })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Registration error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
