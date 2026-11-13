export const commerceMessages = {
  download: 'Скачивание пока недоступно. Готовим оригинальные файлы к выдаче.',
  purchase: 'Покупка пока недоступна. Обои можно сохранить в корзине.',
  product: 'Покупка и скачивание пока недоступны. Готовим магазин к запуску.',
  checkout: 'Оформление и оплата заказов пока недоступны. Сохранённые обои остаются в корзине.',
};

export default function CommerceNotice({ action, compact = false, id }: {
  action: keyof typeof commerceMessages;
  compact?: boolean;
  id?: string;
}) {
  return <p id={id} role="status" className={compact
    ? 'text-xs leading-relaxed text-[var(--foreground)]/75'
    : 'glass-panel p-4 text-sm leading-relaxed'}>{commerceMessages[action]}</p>;
}
