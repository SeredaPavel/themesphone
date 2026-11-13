'use client';
import FormField from '@/components/FormField';
export default function SubscribeBlock() {
  return <section className="form-panel flex flex-col gap-5">
    <h2>Будь в курсе</h2>
    <p id="subscription-availability" role="status" className="form-muted text-sm leading-relaxed">Рассылка пока недоступна. Приём адресов для подписки ещё не открыт.</p>
    <FormField label="Email" type="email" placeholder="Ваш Email" autoComplete="email" disabled aria-describedby="subscription-availability" />
    <button type="button" className="liquid-pill self-start" disabled aria-describedby="subscription-availability">Подписаться</button>
  </section>;
}
