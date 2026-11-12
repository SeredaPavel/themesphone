import Link from 'next/link';
import AuthPanel, { AuthNotice, AuthScreen, AuthStack } from '@/components/auth/AuthSurface';

export default function EmailConfirmationSubmitPage() {
  return <AuthScreen><AuthPanel title="Почта подтверждена"><AuthStack>
    <AuthNotice key="success" kind="success">Теперь можно войти в аккаунт. Продолжите вход привычным способом.</AuthNotice>
    <Link key="login" href="/?auth=popup" className="auth-button auth-button--primary">Продолжить вход</Link>
  </AuthStack></AuthPanel></AuthScreen>;
}
