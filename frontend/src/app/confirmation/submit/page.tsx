// src/app/confirmation/submit/page.tsx

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle } from 'lucide-react';

export default function EmailConfirmationSubmitPage() {
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.push('/');
    }, 2000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="border border-border rounded-2xl p-6 max-w-md w-full text-center shadow-md bg-card">
        <div className="flex justify-center mb-4">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Email подтверждён
        </h1>
        <p className="text-muted-foreground">
          Вы будете перенаправлены на главную страницу через несколько секунд...
        </p>
      </div>
    </div>
  );
}
