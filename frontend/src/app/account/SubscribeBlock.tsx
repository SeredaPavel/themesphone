//src/app/account/SubscribeBlock.tsx

'use client'

export default function SubscribeBlock() {
  return (
    <section className="border border-[var(--foreground)] rounded-2xl p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold mb-2">Будь в курсе</h2>
      <input
        type="email"
        placeholder="Ваш Email"
        className="px-4 py-2 rounded-full border border-[var(--foreground)] bg-transparent outline-none"
      />
      <button className="px-4 py-2 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition text-sm">
        Подписаться
      </button>
      <p className="text-xs text-muted-foreground">
        * Подпишитесь на нашу рассылку, чтобы получать эксклюзивные предложения и информацию о новых продуктах
      </p>
    </section>
  )
}
