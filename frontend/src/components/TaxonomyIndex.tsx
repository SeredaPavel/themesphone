import Link from 'next/link';
import { getCategories, getDevices } from '@/lib/api';

export default async function TaxonomyIndex({ kind }: { kind: 'category' | 'device' }) {
  const isCategory = kind === 'category';
  const items = await (isCategory ? getCategories() : getDevices());
  return (
    <section className="p-4 sm:p-6 max-w-5xl mx-auto">
      <Link href="/" className="inline-block mb-4 underline">Все обои</Link>
      <h1 className="text-3xl font-bold mb-3">{isCategory ? 'Категории обоев' : 'Устройства'}</h1>
      <p className="mb-6">{isCategory ? 'Выберите тему для своей подборки.' : 'Выберите устройство, для которого ищете обои.'}</p>
      {items.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => <li key={item.id}>
          <Link href={`/${kind}/${encodeURIComponent(item.slug)}`} className="block h-full rounded-2xl border p-5 hover:shadow-lg focus-visible:outline-2">
            <h2 className="text-xl font-semibold">{item.title}</h2>
            {item.description && <p className="mt-2 text-sm">{item.description}</p>}
            <span className="inline-block mt-3 text-sm underline">Смотреть обои</span>
          </Link>
        </li>)}
      </ul> : <p>{isCategory ? 'Категории пока не добавлены.' : 'Устройства пока не добавлены.'}</p>}
    </section>
  );
}
