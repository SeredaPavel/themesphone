//src/app/account/OrdersBlock.tsx

'use client'

export default function OrdersBlock() {
  return (
    <section className="form-panel flex flex-col gap-4 overflow-auto max-h-[500px]">
      <h2 className="text-xl font-bold mb-2">История заказов</h2>
      <div className="text-sm italic form-muted">Нет заказов</div>
    </section>
  )
}
