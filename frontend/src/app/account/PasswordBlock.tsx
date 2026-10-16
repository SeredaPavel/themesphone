//src/app/account/PasswordBlock.tsx

'use client'

export default function PasswordBlock() {
  return (
    <section className="border border-[var(--foreground)] rounded-2xl p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold mb-2">Смена пароля</h2>
      <input
        type="password"
        placeholder="Старый пароль"
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <input
        type="password"
        placeholder="Новый пароль"
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <input
        type="password"
        placeholder="Подтверждение пароля"
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <div className="flex gap-2 mt-2">
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
