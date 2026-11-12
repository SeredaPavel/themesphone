// 📄 src/app/auth/login/page.tsx
import LoginForm from '@/components/auth/LoginForm'
import { AuthScreen } from '@/components/auth/AuthSurface'

export default function LoginPage() {
  return (
    <AuthScreen>
      <LoginForm />
    </AuthScreen>
  )
}
