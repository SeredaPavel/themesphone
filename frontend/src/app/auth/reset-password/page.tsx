import { Suspense } from 'react';
import RecoveryForm from '@/components/auth/RecoveryForm';
export const metadata={title:'Новый пароль · ThemesPhone',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function ResetPasswordPage() {
  return <div className="px-5 py-10 sm:py-16"><Suspense fallback={<p className="text-center">Загрузка…</p>}><RecoveryForm reset/></Suspense></div>;
}
