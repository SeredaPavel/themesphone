// 📄 src/components/auth/LoginForm.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthContext } from '@/context/AuthContext'
import Link from 'next/link'

export default function LoginForm() {
  const router = useRouter()
  const { setUser } = useAuthContext()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Ошибка входа')
        return
      }

      setUser(data.user)
      router.replace('/account')
      router.refresh()
    } catch (err) {
      setError('Ошибка соединения')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Email или имя пользователя"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
        className="border p-2 rounded"
      />
      <input
        type="password"
        placeholder="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="border p-2 rounded"
      />
      <button type="submit" className="bg-black text-white py-2 px-4 rounded">
        Войти
      </button>
      {error && <p className="text-red-500">{error}</p>}
      <Link href="/auth/forgot-password" className="text-sm underline">Забыли пароль?</Link>
    </form>
  )
}
