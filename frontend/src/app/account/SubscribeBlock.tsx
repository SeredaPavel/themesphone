'use client';
import FormField from '@/components/FormField';
export default function SubscribeBlock() {
  return <section className="form-panel flex flex-col gap-5">
    <h2>Будь в курсе</h2>
    <FormField label="Email" type="email" placeholder="Ваш Email" autoComplete="email" />
    <button className="liquid-pill self-start">Подписаться</button>
    <p className="text-xs form-muted leading-relaxed">Подпишитесь на нашу рассылку, чтобы получать эксклюзивные предложения и информацию о новых продуктах.</p>
  </section>;
}
