//src/app/account/ProfileBlock.tsx

'use client'

export default function ProfileBlock({ user }: { user: any }) {
  return (
    <section className="border border-[var(--foreground)] rounded-2xl p-6 flex flex-col gap-4">
      <h2 className="text-xl font-bold mb-2">Мой профиль</h2>
      <div className="w-24 h-24 rounded-full bg-gray-400 mx-auto" />
      <label className="text-sm">Имя*</label>
      <input
        type="text"
        defaultValue={user.firstname || ''}
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <label className="text-sm">Фамилия</label>
      <input
        type="text"
        defaultValue={user.lastname || ''}
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <label className="text-sm">Email*</label>
      <input
        type="email"
        defaultValue={user.email}
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <label className="text-sm">Телефон</label>
      <input
        type="tel"
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <label className="text-sm">Адрес выставления счета</label>
      <input
        type="text"
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <div className="flex gap-2 mt-4">
        <button className="px-4 py-2 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition text-sm">
          Редактировать
        </button>
        <button className="px-4 py-2 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition text-sm">
          Сохранить
        </button>
      </div>
    </section>
  )
}
