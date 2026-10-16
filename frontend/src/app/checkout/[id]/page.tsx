'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import PaymentPopup from '@/components/PaymentPopup';
import DownloadPopup from '@/components/DownloadPopup';

export default function CheckoutPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [order, setOrder] = useState<any>(null);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

  const from = searchParams.get('from');

  // Загружаем заказ
  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_STRAPI_URL}/api/orders/${id}?populate=wallpapers`, {
          headers: {
            Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
          },
        });

        const json = await res.json();
        setOrder(json.data);
        setShowPaymentPopup(true);
      } catch (err) {
        console.error('Ошибка загрузки заказа:', err);
      }
    }

    if (id) fetchOrder();
  }, [id]);

  const handlePay = async (method: 'card' | 'sberbank' | 'sbp' | 'paypal') => {
    if (!order) return;

    try {
      const res = await fetch('/api/checkout/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          method,
        }),
      });

      const json = await res.json();

      if (json.success) {
        setShowPaymentPopup(false);
        setShowDownloadPopup(true);
      } else {
        alert('Ошибка оплаты');
      }
    } catch (err) {
      console.error('Ошибка при оплате:', err);
      alert('Ошибка при выполнении оплаты');
    }
  };

  const handleDownload = () => {
    if (!order?.attributes?.wallpapers?.data?.[0]) return;

    const imageUrl = order.attributes.wallpapers.data[0].attributes.imageUrl;
    const title = order.attributes.wallpapers.data[0].attributes.title;

    const url = `/api/download?url=${encodeURIComponent(imageUrl)}&name=${encodeURIComponent(title)}.jpg`;
    window.location.href = url;

    setShowDownloadPopup(false);
  };

  const handleCancel = () => {
    if (from) {
      router.push(from);
    } else {
      setShowPaymentPopup(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Оформление заказа</h1>

      {!order && <p>Загрузка заказа...</p>}

      {order && (
        <div className="mb-6">
          <p>Номер заказа: <strong>{order.id}</strong></p>
          <p>Сумма: <strong>{order.attributes.amount} ₽</strong></p>
          <p>Обоев: <strong>{order.attributes.wallpapers?.data?.length}</strong></p>
        </div>
      )}

      <PaymentPopup
        isOpen={showPaymentPopup}
        onClose={handleCancel}
        onPay={handlePay}
      />

      <DownloadPopup
        isOpen={showDownloadPopup}
        onDownload={handleDownload}
      />
    </div>
  );
}
