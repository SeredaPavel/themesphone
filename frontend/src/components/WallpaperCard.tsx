// 📄 src/components/WallpaperCard.tsx
'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { useAuthContext } from '@/context/AuthContext';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthModal from './AuthModal';

type Props = {
  id: number;
  title: string;
  imageUrl: string;
  isFree: boolean | null;
  price?: number;
  device?: { title: string; slug: string } | null;
  category?: { title: string; slug: string } | null;
  compact?: boolean;
};

export default function WallpaperCard({
  id,
  title,
  imageUrl,
  isFree,
  price,
  device,
  category,
  compact = false,
}: Props) {
  const downloadUrl = `/api/download?url=${encodeURIComponent(imageUrl)}&name=${encodeURIComponent(title)}.jpg`;
  const { addToCart } = useCart();
  const { user } = useAuthContext();
  const [added, setAdded] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const router = useRouter();

  const handleAddToCart = () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    if (!price) return;
    addToCart({ id, title, imageUrl, price });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleBuyNow = async () => {
    if (!price) return;

    const body: any = {
      data: {
        wallpapers: { connect: [id] },
        amount: price,
        paid: false,
      },
    };

    if (user?.id) {
      body.data.users_permission = user.id;
    }

    try {
      const res = await fetch('/api/checkout/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      const orderId = json?.data?.id;

      if (orderId) {
        router.push(`/checkout/${orderId}?from=${encodeURIComponent(window.location.pathname)}`);
      } else {
        alert('Ошибка при создании заказа');
      }
    } catch (err) {
      console.error('Ошибка при заказе:', err);
      alert('Ошибка сервера');
    }
  };

  return (
    <>
      <div
        className={`bg-[var(--background)] text-[var(--foreground)] transition hover:shadow-xl flex flex-col ${
          compact ? 'shadow-sm w-[120px]' : 'shadow-md'
        } rounded-2xl overflow-hidden`}
      >
        <Link href={`/wallpaper/${id}`}>
          <div className={`${compact ? 'aspect-[9/16] h-[180px]' : 'aspect-[9/16]'} overflow-hidden cursor-pointer`}>
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105 rounded-2xl"
            />
          </div>
        </Link>

        <div className={`flex flex-col gap-2 ${compact ? 'px-2 py-3' : 'p-4'} flex-1`}>
          <h2 className={`${compact ? 'text-sm' : 'text-lg'} font-semibold break-words whitespace-normal leading-snug`}>
            <Link href={`/wallpaper/${id}`}>{title}</Link>
          </h2>

          {!compact && (
            <>
              <div className="flex flex-wrap gap-2 text-xs text-[var(--foreground)]/70">
                {category && (
                  <span className="bg-gray-200 dark:bg-neutral-700 px-2 py-0.5 rounded-full">
                    {category.title}
                  </span>
                )}
                {device && (
                  <span className="bg-gray-200 dark:bg-neutral-700 px-2 py-0.5 rounded-full">
                    {device.title}
                  </span>
                )}
              </div>

              <p className="text-sm font-medium mt-1">
                {isFree ? 'Бесплатно' : `${price ?? '—'} ₽`}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {isFree ? (
                  <a
                    href={downloadUrl}
                    className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                  >
                    Загрузить
                  </a>
                ) : (
                  <>
                    <button
                      onClick={handleBuyNow}
                      className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                    >
                      Купить сейчас
                    </button>
                    <button
                      onClick={handleAddToCart}
                      className={`text-sm px-3 py-1 rounded-full border border-[var(--foreground)] transition ${
                        added
                          ? 'bg-[var(--foreground)] text-[var(--background)]'
                          : 'hover:bg-[var(--foreground)] hover:text-[var(--background)]'
                      }`}
                    >
                      {added ? '✓ Добавлено' : 'В корзину'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  );
}
