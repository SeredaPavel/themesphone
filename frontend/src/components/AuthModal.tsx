'use client';

import { useEffect, useState } from 'react';
import AuthMethodChoice from './auth/AuthMethodChoice';
import AuthPanel, { AuthScreen } from './auth/AuthSurface';
import EmailAuthForm from './auth/EmailAuthForm';

export default function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'select' | 'email'>('select');
  useEffect(() => {
    if (!isOpen) { setMode('select'); return; }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (mode === 'email') setMode('select');
      else onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [isOpen, mode, onClose]);
  if (!isOpen) return null;
  return <AuthScreen>
    {mode === 'select' ? <AuthPanel key="choice" title="Вход в аккаунт" variant="choice" dialog onClose={onClose}>
      <AuthMethodChoice onEmail={() => setMode('email')} />
    </AuthPanel> : <EmailAuthForm dialog onBack={() => setMode('select')} onNavigate={onClose} onAuthenticated={() => {
      onClose();
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('auth');
      window.location.replace(nextUrl.pathname + nextUrl.search);
    }} />}
  </AuthScreen>;
}
