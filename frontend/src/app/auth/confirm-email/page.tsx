// src/app/auth/confirm-email/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ConfirmEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const confirmation = searchParams.get('confirmation');

    if (!confirmation) {
      setStatus('error');
      return;
    }

    const confirmEmail = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_STRAPI_URL}/api/auth/email-confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmation }),
        });

        if (!res.ok) {
          setStatus('error');
          return;
        }

        const data = await res.json();
        const { jwt } = data;

        // Сохраняем токен в cookie и localStorage
        document.cookie = `token=${jwt}; path=/`;
        localStorage.setItem('token', jwt);

        setStatus('success');

        // Редирект в личный кабинет
        setTimeout(() => {
          router.push('/account');
        }, 1500);
      } catch (error) {
        console.error('❌ Ошибка подтверждения:', error);
        setStatus('error');
      }
    };

    confirmEmail();
  }, [searchParams, router]);

  return (
    <div className="p-6 text-center">
      {status === 'loading' && <p>⏳ Подтверждаем ваш email...</p>}
      {status === 'success' && <p className="text-green-600">✅ Email подтверждён! Перенаправляем...</p>}
      {status === 'error' && <p className="text-red-600">❌ Ошибка подтверждения. Попробуйте позже.</p>}
    </div>
  );
}
