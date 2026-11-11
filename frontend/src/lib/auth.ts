// src/lib/auth.ts

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
