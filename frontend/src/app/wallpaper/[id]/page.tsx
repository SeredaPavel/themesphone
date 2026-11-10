import Image from 'next/image';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getDescriptionParagraphs, getWallpaper, getWallpaperImageUrl } from '@/lib/wallpaper.server';

export const dynamic = 'force-dynamic';

export default async function WallpaperDetailPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const wallpaper = await getWallpaper(id);
  if (!wallpaper) notFound();
  if (/^\d+$/.test(id)) permanentRedirect(`/wallpaper/${wallpaper.documentId}`);

  const images = (wallpaper.image || []).flatMap(image => {
    if (image.mime && !image.mime.startsWith('image/')) return [];
    const url = getWallpaperImageUrl(image.url);
    return url ? [{ ...image, url }] : [];
  });
  const paragraphs = getDescriptionParagraphs(wallpaper.description);

  return (
    <article className="p-6 max-w-4xl mx-auto">
      <Link href="/" className="inline-block mb-6 underline">Вернуться в каталог</Link>
      <h1 className="text-3xl font-bold mb-6 break-words">{wallpaper.title}</h1>
      {images.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {images.map((image, index) => (
            <Image
              key={image.id}
              src={image.url}
              alt={image.alternativeText || wallpaper.title}
              width={image.width || 800}
              height={image.height || 1200}
              sizes="(max-width: 640px) calc(100vw - 48px), 424px"
              priority={index === 0}
              className="w-full h-auto max-h-[75vh] object-contain rounded-xl"
            />
          ))}
        </div>
      ) : (
        <p className="mb-6 rounded-xl border p-8 text-center">Изображение пока не добавлено.</p>
      )}
      <dl className="mb-6 flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt className="text-sm opacity-70">Категории</dt>
          <dd>{wallpaper.categories?.length ? wallpaper.categories.map((category, index) => (
            <span key={category.slug}>
              {index > 0 && ', '}
              <Link href={`/category/${encodeURIComponent(category.slug)}`} className="underline">{category.title}</Link>
            </span>
          )) : 'Не указаны'}</dd>
        </div>
        <div>
          <dt className="text-sm opacity-70">Устройство</dt>
          <dd>{wallpaper.device ? (
            <Link href={`/device/${encodeURIComponent(wallpaper.device.slug)}`} className="underline">{wallpaper.device.title}</Link>
          ) : 'Не указано'}</dd>
        </div>
        <div>
          <dt className="text-sm opacity-70">Цена</dt>
          <dd>{wallpaper.isFree ? 'Бесплатно' : `${wallpaper.price ?? '—'} ₽`}</dd>
        </div>
      </dl>
      <div className="space-y-3 mb-6 whitespace-pre-wrap">
        {paragraphs.length ? paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>Описание пока не добавлено.</p>}
      </div>
      <p className="rounded-xl border p-4 text-sm" role="status">
        {wallpaper.isFree
          ? 'Скачивание временно недоступно. Мы готовим эту функцию к запуску.'
          : 'Покупка и скачивание временно недоступны. Мы готовим магазин к запуску.'}
      </p>
    </article>
  );
}
