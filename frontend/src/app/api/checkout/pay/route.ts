// src/app/api/checkout/pay/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { orderId, method } = await req.json();

    if (!orderId || !method) {
      return NextResponse.json({ error: 'orderId and method are required' }, { status: 400 });
    }

    // Пока фейк: просто помечаем заказ как "оплаченный" в Strapi
    const STRAPI_API_URL = process.env.STRAPI_API_URL;
    const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;

    const updateRes = await fetch(`${STRAPI_API_URL}/api/orders/${orderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify({
        data: {
          paid: true,
        },
      }),
    });

    const result = await updateRes.json();

    if (!updateRes.ok) {
      return NextResponse.json({ error: result }, { status: updateRes.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Ошибка оплаты:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
