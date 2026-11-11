'use client';
import FormField from '@/components/FormField';
export default function PasswordBlock() {
  return <section className="form-panel flex flex-col gap-5">
    <h2>Смена пароля</h2>
    <FormField label="Старый пароль" type="password" placeholder="Текущий пароль" autoComplete="current-password" />
    <FormField label="Новый пароль" type="password" placeholder="Новый пароль" autoComplete="new-password" />
    <FormField label="Подтверждение пароля" type="password" placeholder="Повторите новый пароль" autoComplete="new-password" />
    <div className="flex flex-wrap gap-2 mt-2">
      <button className="liquid-pill">Редактировать</button>
      <button className="liquid-pill liquid-pill--accent">Сохранить</button>
    </div>
  </section>;
}
