'use client';

import { useCart } from '@/context/CartContext';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {useState} from 'react';
import {useAuthContext} from '@/context/AuthContext';
import Link from 'next/link';

export default function CartContent({ordersEnabled,paymentsEnabled}:{ordersEnabled:boolean;paymentsEnabled:boolean}) {
  const { cartItems, removeFromCart, clearCart,isReady,checkoutKey } = useCart();
  const {user}=useAuthContext();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const router = useRouter();

  const total = cartItems.reduce((sum, item) => sum + item.price, 0);

  const handleCheckout = async () => {
    if(!ordersEnabled || pending || !isReady)return;
    if(!user){router.push('/?auth=popup');return;}
    if(cartItems.some(item=>!item.documentId)){setError('В корзине есть товар, добавленный до обновления. Удалите его и добавьте из каталога заново.');return;}
    setPending(true);setError('');
    try {
    const res = await fetch('/api/checkout/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items:cartItems.map(item=>item.documentId),checkoutKey,
      }),
    });

    const json = await res.json();
    const orderId = json?.order?.id;

    if (orderId) {
      router.push(`/checkout/${encodeURIComponent(orderId)}`);
    } else {
      setError(typeof json?.error==='string'?json.error:'Не удалось создать заказ');
    }
    }catch{setError('Не удалось оформить заказ. Попробуйте ещё раз.');}
    finally{setPending(false);}
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">Корзина</h1>

        <div className="flex gap-3">
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

      <p className="auth-notice mb-6" id="cart-availability">{!ordersEnabled?'Оформление и оплата пока недоступны. Товары можно сохранить в корзине.':paymentsEnabled?'Тестовый режим ЮKassa: реальные деньги не списываются. Окончательная стоимость будет показана при оформлении.':'Окончательный состав и стоимость будут показаны при оформлении. Оплата пока недоступна.'}</p>
      {error && <p className="auth-notice auth-notice--error mb-4" role="alert">{error}</p>}

      {!isReady?<p role="status">Загружаем корзину…</p>:cartItems.length === 0 ? (
        <p className="opacity-75">Ваша корзина пуста.</p>
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
                  <Link href={`/wallpaper/${item.documentId||item.id}`} className="font-medium">{item.title}</Link>
                  <p className="text-sm opacity-80">{item.price} ₽</p>
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
            <p className="text-lg font-semibold mb-2">Предварительно: {total.toLocaleString('ru-RU')} ₽</p>
            <button
              onClick={handleCheckout}
              disabled={!ordersEnabled || pending || !isReady}
              aria-describedby="cart-availability"
              className="liquid-pill"
            >
              {pending?'Оформляем…':'Оформить заказ'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
