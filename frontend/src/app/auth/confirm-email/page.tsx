// src/app/auth/confirm-email/page.tsx
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ConfirmEmailContent() {
  const searchParams = useSearchParams();
  const fromAccount = searchParams.get('account') === '1';
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
    <section className="form-panel w-full max-w-lg flex flex-col gap-5">
      <p className="form-eyebrow">ThemesPhone · Личный кабинет</p>
      <h1 className="!text-4xl sm:!text-5xl">Подтверждение почты</h1>
      {status === 'loading' && <p role="status" className="form-muted">Подтверждаем ваш email…</p>}
      {status === 'success' && <p role="status" className="form-message">{fromAccount?'Email подтверждён.':'Email подтверждён. Теперь можно войти в аккаунт.'}</p>}
      {status === 'error' && <p role="alert" className="form-message form-message--error">Ссылка недействительна, уже использована или сервис временно недоступен. {fromAccount?'Новую ссылку можно запросить в кабинете.':'Письмо можно отправить повторно в форме входа.'}</p>}
      {status !== 'loading' && <Link href={fromAccount?'/account':'/?auth=popup'} className="liquid-pill self-start">{fromAccount?'Перейти в личный кабинет':'Вернуться ко входу'}</Link>}
    </section>
  );
}
export default function ConfirmEmailPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10"><Suspense fallback={<p>Загрузка...</p>}>
      <ConfirmEmailContent />
    </Suspense></div>
  );
}
