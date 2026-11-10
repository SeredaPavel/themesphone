import Link from 'next/link';

export default function WallpaperNotFound() {
  return (
    <section className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-3">Обои не найдены</h1>
      <p className="mb-6">Возможно, товар удалён или ещё не опубликован.</p>
      <Link href="/" className="underline">Вернуться в каталог</Link>
    </section>
  );
}
