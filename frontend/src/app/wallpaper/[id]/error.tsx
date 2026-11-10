'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';

export default function WallpaperError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <section className="p-6 max-w-4xl mx-auto" role="alert">
      <h1 className="text-2xl font-bold mb-3">Не удалось загрузить обои</h1>
      <p className="mb-6">Попробуйте ещё раз через некоторое время.</p>
      <div className="flex flex-wrap gap-4">
        <button className="rounded-full border px-4 py-2" onClick={() => startTransition(() => {
          router.refresh();
          reset();
        })}>Повторить загрузку</button>
        <Link href="/" className="self-center underline">Вернуться в каталог</Link>
      </div>
    </section>
  );
}
