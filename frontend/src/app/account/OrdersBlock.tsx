'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {ShopOrder} from '@/lib/checkout';
import OrderDownload from '@/components/OrderDownload';
const states:Record<ShopOrder['state'],string>={awaiting_payment:'Ожидает оплаты',cancelled:'Отменён',expired:'Срок оформления истёк',test_paid:'Тестовая оплата',paid:'Оплачен'};
const money=(value:number)=>(value/100).toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
export default function OrdersBlock(){
  const [orders,setOrders]=useState<ShopOrder[]>([]),[page,setPage]=useState(1),[hasMore,setMore]=useState(false);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    fetch('/api/account/orders?page='+page,{cache:'no-store',signal:controller.signal}).then(async res=>{
      const data=await res.json();if(controller.signal.aborted)return;
      if(!res.ok){setError(data.error||'Не удалось загрузить покупки.');return;}
      setOrders(data.orders);setMore(data.hasMore);
    }).catch(()=>{if(!controller.signal.aborted)setError('Не удалось загрузить покупки. Попробуйте ещё раз.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[page,revision]);
  return <section id="orders" className="form-panel flex flex-col gap-4 scroll-mt-6" aria-labelledby="orders-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="orders-heading">История заказов</h2><button className="liquid-pill text-sm" disabled={loading} onClick={()=>setRevision(value=>value+1)}>Обновить</button></div>
    {loading?<p role="status" className="text-sm form-muted">Загружаем покупки…</p>:error?<p role="alert" className="form-message form-message--error">{error}</p>:!orders.length?<p className="text-sm form-muted">У вас пока нет заказов. Покупки и повторные загрузки появятся здесь.</p>:<ul className="space-y-4">{orders.map(order=><li key={order.id} className="rounded-2xl border border-teal-900/15 p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2 text-sm"><Link href={'/checkout/'+order.id} className="font-medium hover:underline">Заказ № {order.id.slice(0,8)}</Link><span>{states[order.state]}</span></div>
      <p className="text-xs form-muted">{new Date(order.createdAt).toLocaleString('ru-RU')}</p>
      <ul className="space-y-3">{order.items.map(item=><li key={item.documentId}><div className="flex justify-between gap-3 text-sm"><Link href={'/wallpaper/'+item.documentId} className="hover:underline">{item.title}</Link><span className="shrink-0">{money(item.unitKopecks)}</span></div><OrderDownload order={order.id} wallpaper={item.documentId} download={item.download}/></li>)}</ul>
      <div className="flex flex-wrap justify-between items-center gap-3"><strong>{money(order.totalKopecks)}</strong><Link href={'/checkout/'+order.id} className="liquid-pill text-sm">{order.state==='awaiting_payment'?'Продолжить оформление':'Открыть заказ'}</Link></div>
    </li>)}</ul>}
    {(page>1||hasMore)&&<nav aria-label="Страницы заказов" className="flex gap-3 items-center"><button className="liquid-pill" disabled={loading||page===1} onClick={()=>setPage(value=>value-1)}>Назад</button><span className="text-sm">{page}</span><button className="liquid-pill" disabled={loading||!hasMore} onClick={()=>setPage(value=>value+1)}>Далее</button></nav>}
  </section>;
}
