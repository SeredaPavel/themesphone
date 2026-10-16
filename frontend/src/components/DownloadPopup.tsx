// src/components/DownloadPopup.tsx
'use client';

interface DownloadPopupProps {
  isOpen: boolean;
  onDownload: () => void;
}

export default function DownloadPopup({ isOpen, onDownload }: DownloadPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-6 w-full max-w-sm text-center">
        <h2 className="text-xl font-bold mb-4">Оплата прошла успешно</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          Подвижные обои в вашем распоряжении. Нажмите, чтобы скачать.
        </p>
        <button
          onClick={onDownload}
          className="bg-[var(--foreground)] text-[var(--background)] px-4 py-2 rounded-full hover:opacity-90 transition"
        >
          Загрузить
        </button>
      </div>
    </div>
  );
}
