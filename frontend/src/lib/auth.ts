// src/lib/auth.ts

// 🔹 Получение пользователя по токену
export async function getUserFromToken(token: string) {
  try {
    const res = await fetch('/api/me', {
      headers: {
        Authorization: `Bearer ${token}`, // ← отправляем токен напрямую
      },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Ошибка получения пользователя:', err);
    return null;
  }
}

// 🔹 Авторизация по email и паролю (добавлено)
export async function loginUser(email: string, password: string) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });

  const data = await res.json();

  if (!res.ok) throw new Error(data?.error || "Ошибка входа");

  return data.user;
}
