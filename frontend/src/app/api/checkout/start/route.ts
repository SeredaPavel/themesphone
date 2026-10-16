// src/app/api/checkout/start/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { data } = await req.json();

    const STRAPI_API_URL = process.env.STRAPI_API_URL;
    const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;

    if (!STRAPI_API_URL || !STRAPI_API_TOKEN) {
      return NextResponse.json({ error: 'Strapi config missing' }, { status: 500 });
    }

    const res = await fetch(`${STRAPI_API_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify({ data }),
    });

    const result = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: result }, { status: res.status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
