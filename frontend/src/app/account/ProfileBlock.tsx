'use client';
import FormField from '@/components/FormField';
export default function ProfileBlock({ user }: { user: any }) {
  return <section className="form-panel flex flex-col gap-5">
    <h2>Мой профиль</h2>
    <div aria-hidden="true" className="w-20 h-20 rounded-full bg-[#deeded] text-[#337780] flex items-center justify-center text-2xl mx-auto">{(user.firstname || user.username || user.email || '?').slice(0, 1).toUpperCase()}</div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FormField label="Имя" defaultValue={user.firstname || ''} placeholder="Ваше имя" autoComplete="given-name" />
      <FormField label="Фамилия" defaultValue={user.lastname || ''} placeholder="Ваша фамилия" autoComplete="family-name" />
    </div>
    <FormField label="Email" type="email" defaultValue={user.email} placeholder="name@example.com" autoComplete="email" />
    <FormField label="Телефон" type="tel" placeholder="Номер телефона" autoComplete="tel" />
    <FormField label="Адрес выставления счёта" placeholder="Ваш адрес" autoComplete="street-address" />
    <div className="flex flex-wrap gap-2 mt-2">
      <button className="liquid-pill">Редактировать</button>
      <button className="liquid-pill liquid-pill--accent">Сохранить</button>
    </div>
  </section>;
}
