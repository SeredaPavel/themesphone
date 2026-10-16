'use client';

import { useEffect } from 'react';

interface PaymentPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onPay: (method: 'card' | 'sberbank' | 'sbp' | 'paypal') => void;
}

export default function PaymentPopup({ isOpen, onClose, onPay }: PaymentPopupProps) {
  // Управление прокруткой: блокируем при открытии и восстанавливаем при закрытии или размонтировании
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    // ВОССТАНАВЛИВАЕМ scroll даже если страница будет закрыта/покинута
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-xl font-bold text-center mb-6">Выберите способ оплаты</h2>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => onPay('card')}
            className="bg-indigo-600 text-white py-2 rounded-xl hover:bg-indigo-700 transition"
          >
            Оплатить картой
          </button>
          <button
            onClick={() => onPay('sberbank')}
            className="bg-green-600 text-white py-2 rounded-xl hover:bg-green-700 transition"
          >
            Сбербанк Онлайн
          </button>
          <button
            onClick={() => onPay('sbp')}
            className="bg-orange-500 text-white py-2 rounded-xl hover:bg-orange-600 transition"
          >
            СБП (Система быстрых платежей)
          </button>
          <button
            onClick={() => onPay('paypal')}
            className="bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 transition"
          >
            PayPal
          </button>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:underline text-center mt-2"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
