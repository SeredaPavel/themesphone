import { Suspense } from 'react';
import RecoveryForm from '@/components/auth/RecoveryForm';
import AuthPanel, { AuthScreen, AuthStack } from '@/components/auth/AuthSurface';
export const metadata={title:'Новый пароль · ThemesPhone',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function ResetPasswordPage() {
  return <AuthScreen><Suspense fallback={<AuthPanel title="Новый пароль"><AuthStack><p role="status" className="auth-copy">Загрузка…</p></AuthStack></AuthPanel>}><RecoveryForm reset/></Suspense></AuthScreen>;
}
