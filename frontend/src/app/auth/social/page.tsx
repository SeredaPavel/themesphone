import {Suspense} from 'react';
import SocialRegistration from '@/components/auth/SocialRegistration';
import AuthPanel, {AuthScreen, AuthStack} from '@/components/auth/AuthSurface';
export default function SocialPage() {return <AuthScreen><Suspense fallback={<AuthPanel title="Продолжение входа"><AuthStack><p role="status" className="auth-copy">Загрузка…</p></AuthStack></AuthPanel>}><SocialRegistration/></Suspense></AuthScreen>;}
