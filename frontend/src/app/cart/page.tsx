'use client';

import { useCart } from '@/context/CartContext';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function CartPage() {
  const { cartItems, removeFromCart, clearCart, addToCart } = useCart();
  const router = useRouter();

  const total = cartItems.reduce((sum, item) => sum + item.price, 0);

  // Добавим заглушку для тестового товара
  const dummyItem = {
    id: 99999,
    title: 'Демо обои',
    imageUrl: '/demo.jpg',
    price: 100,
  };

  const handleCheckout = async () => {
    const res = await fetch('/api/checkout/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          wallpapers: { connect: cartItems.map(item => item.id) },
          amount: total,
          paid: false,
        },
      }),
    });

    const json = await res.json();
    const orderId = json?.data?.id;

    if (orderId) {
      router.push(`/checkout/${orderId}?from=/cart`);
    } else {
      alert('Не удалось создать заказ');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">Корзина</h1>

        <div className="flex gap-3">
          <button
            onClick={() => addToCart(dummyItem)}
            className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
          >
            Добавить
          </button>

          {cartItems.length > 0 && (
            <button
              onClick={clearCart}
              className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
            >
              Очистить корзину
            </button>
          )}
        </div>
      </div>

      {cartItems.length === 0 ? (
        <p className="text-gray-500">Ваша корзина пуста.</p>
      ) : (
        <>
          <ul className="divide-y divide-gray-200">
            {cartItems.map(item => (
              <li key={item.id} className="flex items-center gap-4 py-4">
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  width={80}
                  height={120}
                  className="rounded object-cover"
                />
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-gray-500">{item.price} ₽</p>
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 text-right">
            <p className="text-lg font-semibold mb-2">Итого: {total} ₽</p>
            <button
              onClick={handleCheckout}
              className="inline-block px-4 py-2 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
            >
              Перейти к оплате
            </button>
          </div>
        </>
      )}
    </div>
  );
}
