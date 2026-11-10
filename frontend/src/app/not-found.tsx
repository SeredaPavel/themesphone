import Link from 'next/link';

export default function NotFound() {
  return <section className="p-6 max-w-4xl mx-auto">
    <h1 className="text-2xl font-bold mb-3">Страница не найдена</h1>
    <p className="mb-6">Возможно, раздел удалён или адрес указан неверно.</p>
    <Link href="/" className="underline">Вернуться в каталог</Link>
  </section>;
}
