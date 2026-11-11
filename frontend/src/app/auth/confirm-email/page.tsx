// src/app/auth/confirm-email/page.tsx
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ConfirmEmailContent() {
  const searchParams = useSearchParams();
  const request = useRef<Promise<Response> | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const confirmation = searchParams.get('confirmation');

    if (!confirmation) {
      setStatus('error');
      return;
    }

    const confirmEmail = async () => {
      try {
        request.current ||= fetch('/api/auth/email-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmation }),
        });
        const res = await request.current;

        if (!res.ok) {
          setStatus('error');
          return;
        }

        setStatus('success');
      } catch (error) {
        setStatus('error');
      }
    };

    confirmEmail();
  }, [searchParams]);

  return (
    <div className="p-6 text-center">
      {status === 'loading' && <p>⏳ Подтверждаем ваш email...</p>}
      {status === 'success' && <><p>Email подтверждён. Теперь можно войти в аккаунт.</p><Link href="/?auth=popup" className="liquid-pill mt-4">Войти</Link></>}
      {status === 'error' && <p>Ссылка недействительна, уже использована или сервис временно недоступен.</p>}
    </div>
  );
}
export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<p>Загрузка...</p>}>
      <ConfirmEmailContent />
    </Suspense>
  );
}
