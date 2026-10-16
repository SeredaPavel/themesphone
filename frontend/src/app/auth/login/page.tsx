// 📄 src/app/auth/login/page.tsx
import LoginForm from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">Вход в аккаунт</h1>
      <LoginForm />
    </main>
  )
}
