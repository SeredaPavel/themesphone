// src/app/wallpaper/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_STRAPI_URL;

interface Wallpaper {
  id: number;
  title: string;
  description?: string;
  price: number;
  isFree: boolean;
  category: { title: string };
  device: { title: string };
  image: { url: string }[]; // multiple media
}

export default function WallpaperDetailPage() {
  const { id } = useParams();
  const [wallpaper, setWallpaper] = useState<Wallpaper | null>(null);

  useEffect(() => {
    async function fetchWallpaper() {
      const res = await fetch(`${API_URL}/api/wallpapers/${id}?populate=deep`, {
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRAPI_API_TOKEN}`,
        },
      });
      const data = await res.json();
      setWallpaper(data.data?.attributes ? {
        id: data.data.id,
        title: data.data.attributes.title,
        description: data.data.attributes.description,
        price: data.data.attributes.price,
        isFree: data.data.attributes.isFree,
        category: data.data.attributes.category?.data?.attributes,
        device: data.data.attributes.device?.data?.attributes,
        image: data.data.attributes.image?.data?.map((img: any) => ({
          url: img.attributes.url,
        })) || [],
      } : null);
    }

    fetchWallpaper();
  }, [id]);

  if (!wallpaper) return <div className="p-4">Загрузка...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">{wallpaper.title}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {wallpaper.image.map((img, index) => (
          <Image
            key={index}
            src={`${API_URL}${img.url}`}
            alt={wallpaper.title}
            width={800}
            height={1200}
            className="rounded-xl shadow"
          />
        ))}
      </div>

      <p className="mb-2 text-muted">Категория: {wallpaper.category?.title}</p>
      <p className="mb-2 text-muted">Устройство: {wallpaper.device?.title}</p>

      <p className="mb-4">{wallpaper.description || 'Описание отсутствует.'}</p>

      <div className="flex gap-4 mt-6">
        {wallpaper.isFree ? (
          <a
            href={`/api/download?id=${wallpaper.id}`}
            className="px-6 py-2 rounded-xl border hover:bg-green-100 transition"
          >
            Загрузить бесплатно
          </a>
        ) : (
          <>
            <Link
              href={`/checkout/${wallpaper.id}`}
              className="px-6 py-2 rounded-xl border hover:bg-blue-100 transition"
            >
              Купить сейчас – {wallpaper.price} ₽
            </Link>

            <button
              className="px-6 py-2 rounded-xl border hover:bg-gray-100 transition"
              onClick={() => {
                // Добавить в корзину
              }}
            >
              В корзину
            </button>
          </>
        )}
      </div>
    </div>
  );
}
