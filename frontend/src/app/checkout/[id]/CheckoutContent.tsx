'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import AuthPanel,{AuthStack,AuthNotice} from '@/components/auth/AuthSurface';
import {PaymentMethods} from '@/components/PaymentPopup';
import type {ShopOrder} from '@/lib/checkout';
import {useCart} from '@/context/CartContext';
import OrderDownload from '@/components/OrderDownload';
const money=(kopecks:number)=>(kopecks/100).toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
const labels:Record<ShopOrder['state'],string>={awaiting_payment:'Ожидает оплаты',cancelled:'Заказ отменён',expired:'Срок заказа истёк',test_paid:'Тестовая оплата подтверждена',paid:'Оплачен'};

export default function CheckoutContent({paymentsEnabled}:{paymentsEnabled:boolean}) {
  const {id}=useParams<{id:string}>();
  const {restartCheckout,completeOrder,isReady}=useCart();
  const [order,setOrder]=useState<ShopOrder|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [pending,setPending]=useState(false);
  const [login,setLogin]=useState(false);
  const [payment,setPayment]=useState<{state:string;test:true;confirmationUrl:string|null}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setOrder(null);setLogin(false);
    fetch('/api/checkout/'+encodeURIComponent(id)+(paymentsEnabled?'/payment':''),{cache:'no-store',signal:controller.signal})
      .then(async res=>{const data=await res.json();if(controller.signal.aborted)return;
        if(!res.ok){setLogin(res.status===401);setError(data.error||'Не удалось загрузить заказ.');return;}setOrder(data.order);setPayment(data.payment||null);})
      .catch(()=>{if(!controller.signal.aborted)setError('Не удалось загрузить заказ. Попробуйте обновить страницу.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[id,paymentsEnabled]);
  useEffect(()=>{if(order&&isReady)completeOrder(order);},[order,isReady,completeOrder]);
  async function pay(refresh=false){
    if(pending)return;setPending(true);setError('');
    try{
      const res=await fetch('/api/checkout/'+encodeURIComponent(id)+'/payment',{method:refresh?'GET':'POST',...(refresh?{}:{headers:{'Content-Type':'application/json'},body:'{}'}),cache:'no-store'});
      const data=await res.json();
      if(!res.ok){setError(data.error||'Не удалось связаться с ЮKassa.');return;}
      setOrder(data.order);setPayment(data.payment);
      if(!refresh&&data.payment?.confirmationUrl)window.location.assign(data.payment.confirmationUrl);
    }catch{setError('Не удалось проверить оплату. Попробуйте ещё раз.');}finally{setPending(false);}
  }
  async function cancel() {
    if(pending)return;setPending(true);setError('');
    try {
      const res=await fetch('/api/checkout/'+encodeURIComponent(id),{method:'POST'});
      const data=await res.json();
      if(!res.ok){setError(data.error||'Не удалось отменить заказ.');return;}
      setOrder(data.order);
    }catch{setError('Не удалось отменить заказ. Попробуйте ещё раз.');}finally{setPending(false);}
  }
  return <div className="flex justify-center py-8 px-4"><AuthPanel title="Оформление заказа"><AuthStack>
    {loading && <p className="auth-copy" role="status">Загружаем заказ…</p>}
    {error && <AuthNotice kind="error">{error}</AuthNotice>}
    {order && <div className="space-y-4">
      <p className="auth-copy">{labels[order.state]} · № {order.id.slice(0,8)}</p>
      <ul className="divide-y divide-white/15">{order.items.map(item=><li key={item.documentId} className="flex justify-between gap-4 py-3 text-sm">
        <div><Link href={'/wallpaper/'+item.documentId} className="hover:underline">{item.title}</Link><OrderDownload order={order.id} wallpaper={item.documentId} download={item.download}/></div><span className="shrink-0">{money(item.unitKopecks)}</span>
      </li>)}</ul>
      <p className="flex justify-between gap-4 text-lg"><span>Итого</span><strong>{money(order.totalKopecks)}</strong></p>
      {order.state==='awaiting_payment' && <>
        <p className="auth-copy">{paymentsEnabled?'Тестовый режим. Используйте тестовую карту ЮKassa — реальные деньги не списываются.':'Проверьте состав и стоимость. Оплата пока недоступна.'}</p>
        <PaymentMethods enabled={paymentsEnabled&&(!payment||['creating','pending'].includes(payment.state))} pending={pending} onPay={()=>pay()}/>
        {payment?<button type="button" className="auth-link" onClick={()=>pay(true)} disabled={pending}>Проверить оплату</button>:<button type="button" className="auth-link" onClick={cancel} disabled={pending}>{pending?'Отменяем…':'Отменить заказ'}</button>}
      </>}
      {order.state==='expired' && <p className="auth-copy">Оформите заказ заново из корзины — стоимость будет проверена ещё раз.</p>}
      {order.state==='test_paid' && <AuthNotice kind="success">ЮKassa подтвердила тестовую оплату. Деньги не списаны. Для тестовых покупок доступны только специально подготовленные тестовые файлы.</AuthNotice>}
    </div>}
    {login && <Link href="/?auth=popup" className="auth-button auth-button--primary">Войти в аккаунт</Link>}
    {order&&['paid','test_paid'].includes(order.state)&&<Link href="/account#orders" className="auth-button">Мои покупки</Link>}
    <Link href="/cart" className="auth-button" onClick={()=>{if(order && ['cancelled','expired'].includes(order.state))restartCheckout();}}>{order && ['cancelled','expired'].includes(order.state)?'Оформить заново из корзины':'Вернуться в корзину'}</Link>
  </AuthStack></AuthPanel></div>;
}
