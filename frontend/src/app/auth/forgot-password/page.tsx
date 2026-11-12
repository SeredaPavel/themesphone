import { Suspense } from 'react';
import RecoveryForm from '@/components/auth/RecoveryForm';
import AuthPanel, { AuthScreen, AuthStack } from '@/components/auth/AuthSurface';
export const metadata={title:'Восстановление пароля · ThemesPhone',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function ForgotPasswordPage() {
  return <AuthScreen><Suspense fallback={<AuthPanel title="Восстановление пароля"><AuthStack><p role="status" className="auth-copy">Загрузка…</p></AuthStack></AuthPanel>}><RecoveryForm/></Suspense></AuthScreen>;
}
