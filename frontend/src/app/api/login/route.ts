// src/app/api/login/route.ts
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { identifier, password } = await req.json();

    const response = await fetch(`${process.env.STRAPI_API_URL}/api/auth/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "Ошибка входа" }), { status: 401 });
    }

    // ✅ Должно быть await cookies()
    const cookieStore = await cookies();

    cookieStore.set("token", data.jwt, {
      httpOnly: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 дней
    });

    return Response.json({ user: data.user });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
  }
}
