//src/app/account/OrdersBlock.tsx

'use client'

export default function OrdersBlock() {
  return (
    <section className="border border-[var(--foreground)] rounded-2xl p-6 flex flex-col gap-4 overflow-auto max-h-[500px]">
      <h2 className="text-xl font-bold mb-2">История заказов</h2>
      <div className="text-sm italic text-muted-foreground">Нет заказов</div>
    </section>
  )
}
