import {Suspense} from 'react';
import AccountMergeForm from '@/components/auth/AccountMergeForm';
import AuthPanel,{AuthScreen,AuthStack} from '@/components/auth/AuthSurface';

export const metadata={title:'Объединение аккаунтов · ThemesPhone',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function MergePage() {
  return <AuthScreen><Suspense fallback={<AuthPanel title="Объединение аккаунтов"><AuthStack><p role="status" className="auth-copy">Проверяем профили…</p></AuthStack></AuthPanel>}><AccountMergeForm /></Suspense></AuthScreen>;
}
