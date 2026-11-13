//src/app/account/OrdersBlock.tsx

'use client'

export default function OrdersBlock() {
  return (
    <section className="form-panel flex flex-col gap-4 overflow-auto max-h-[500px]">
      <h2 className="text-xl font-bold mb-2">История заказов</h2>
      <p role="status" className="text-sm form-muted leading-relaxed">История покупок появится после запуска оформления заказов.</p>
    </section>
  )
}
