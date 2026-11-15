'use client';

import { useCart } from '@/context/CartContext';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {useState} from 'react';
import {useAuthContext} from '@/context/AuthContext';
import Link from 'next/link';
import OrderDownload from '@/components/OrderDownload';
import {cartCheckout} from '@/lib/cart-checkout';

export default function CartContent({ordersEnabled,paymentsEnabled}:{ordersEnabled:boolean;paymentsEnabled:boolean}) {
  const { cartItems, removeFromCart, clearCart,isReady,checkoutKey,rememberOrder,purchases,isCheckingPurchases,purchasesError,refreshPurchases,restartCheckout } = useCart();
  const {user}=useAuthContext();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const router = useRouter();

  const {unpaid,total}=cartCheckout(cartItems,purchases);

  const handleCheckout = async () => {
    if(!ordersEnabled || pending || !isReady||isCheckingPurchases||purchasesError||!unpaid.length)return;
    if(!user){router.push('/?auth=popup');return;}
    if(unpaid.some(item=>!item.documentId)){setError('В корзине есть товар, добавленный до обновления. Удалите его и добавьте из каталога заново.');return;}
    setPending(true);setError('');
    try {
    const res = await fetch('/api/checkout/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items:unpaid.map(item=>item.documentId),checkoutKey,
      }),
    });

    const json = await res.json();
    const orderId = json?.order?.id;

    if (orderId) {
      rememberOrder(orderId);
      router.push(`/checkout/${encodeURIComponent(orderId)}`);
    } else {
      if(res.status===409){restartCheckout();refreshPurchases();}
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
      {isCheckingPurchases&&<p role="status" className="text-sm mb-4">Проверяем ранее оплаченные товары…</p>}
      {purchasesError&&<div className="auth-notice auth-notice--error mb-4" role="alert"><p>{purchasesError}</p><button className="liquid-pill mt-3" onClick={refreshPurchases}>Повторить проверку</button></div>}

      {!isReady?<p role="status">Загружаем корзину…</p>:cartItems.length === 0 ? (
        <div className="space-y-4"><p className="opacity-75">Ваша корзина пуста.</p><Link href="/account#orders" className="liquid-pill">Мои покупки</Link></div>
      ) : (
        <>
          <ul className="divide-y divide-gray-200">
            {cartItems.map(item => (
              <li key={item.id} className="flex flex-wrap sm:flex-nowrap items-center gap-4 py-4">
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  width={80}
                  height={120}
                  className="rounded object-cover"
                />
                <div className="flex-1">
                  <Link href={`/wallpaper/${item.documentId||item.id}`} className="font-medium">{item.title}</Link>
                  {item.documentId&&purchases[item.documentId]?<>
                    <p className="text-sm opacity-75">В сумму заказа не входит</p>
                    <OrderDownload order={purchases[item.documentId].orderId} wallpaper={item.documentId} download={purchases[item.documentId].download}/>
                  </>:<p className="text-sm opacity-80">{item.price} ₽</p>}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                {item.documentId&&purchases[item.documentId]&&<span className="text-sm font-medium">Вы уже оплатили этот товар</span>}
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="text-sm px-3 py-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                >
                  Удалить
                </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 text-right">
            {!isCheckingPurchases&&!purchasesError&&<p className="text-lg font-semibold mb-2">Предварительно: {total.toLocaleString('ru-RU')} ₽</p>}
            {unpaid.length?<button
              onClick={handleCheckout}
              disabled={!ordersEnabled || pending || !isReady||isCheckingPurchases||!!purchasesError}
              aria-describedby="cart-availability"
              className="liquid-pill"
            >
              {pending?'Оформляем…':'Оформить заказ'}
            </button>:<Link href="/account#orders" className="liquid-pill">Мои покупки</Link>}
          </div>
        </>
      )}
    </div>
  );
}
