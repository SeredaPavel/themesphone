'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ShoppingBag} from 'lucide-react';
import {useAuthContext} from '@/context/AuthContext';
import {useCart} from '@/context/CartContext';
import {prepareQuickBuy,payQuickBuy,quickBuyStorageKey,readQuickBuyKey} from '@/lib/quick-buy';
import type {CartPurchase,ShopOrder} from '@/lib/checkout';
import AuthModal from './AuthModal';
import AuthPanel,{AuthScreen,AuthStack,AuthNotice} from './auth/AuthSurface';
import {PaymentMethods} from './PaymentPopup';
import OrderDownload from './OrderDownload';

export default function BuyButton({documentId,title,available=false,className='liquid-pill',tabIndex}:{documentId:string;title:string;available?:boolean;className?:string;tabIndex?:number}){
  const {user,loading:authLoading}=useAuthContext(),{rememberOrder,completeOrder}=useCart(),router=useRouter();
  const [open,setOpen]=useState(false),[auth,setAuth]=useState(false),[loading,setLoading]=useState(false),[paying,setPaying]=useState(false),[error,setError]=useState('');
  const [order,setOrder]=useState<ShopOrder|null>(null),[purchase,setPurchase]=useState<CartPurchase|null>(null);
  const controller=useRef<AbortController|null>(null),key=useRef(''),button=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDivElement>(null),activeUser=useRef(user?.id);
  const previousUser=useRef(user?.id);
  activeUser.current=user?.id;
  const close=useCallback(()=>{controller.current?.abort();setOpen(false);setPaying(false);setLoading(false);button.current?.focus()},[]);
  useEffect(()=>{if(open){const escape=(event:KeyboardEvent)=>{
    if(event.key==='Escape')close();
    if(event.key==='Tab'){
      const nodes=dialog.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)');if(!nodes?.length)return;
      if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes[nodes.length-1].focus()}
      else if(!event.shiftKey&&document.activeElement===nodes[nodes.length-1]){event.preventDefault();nodes[0].focus()}
    }
  };const previous=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.querySelector<HTMLElement>('.auth-close')?.focus();window.addEventListener('keydown',escape);
  return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',escape)}}},[open,close]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(previousUser.current!==user?.id){previousUser.current=user?.id;key.current='';if(open||auth){close();setAuth(false)}}},[user?.id,close,open,auth]);
  function savedKey(rotate=false){
    const storageKey=quickBuyStorageKey(user!.id,documentId);let stored=null;
    try{stored=localStorage.getItem(storageKey)}catch{}
    const value=rotate?crypto.randomUUID():readQuickBuyKey(stored||key.current,()=>crypto.randomUUID());
    key.current=value;try{localStorage.setItem(storageKey,value)}catch{}return value;
  }
  async function prepare(){
    if(!user)return;const userId=user.id;
    controller.current?.abort();const request=new AbortController();controller.current=request;
    setOpen(true);setLoading(true);setError('');setOrder(null);setPurchase(null);
    try{
      let result=await prepareQuickBuy(documentId,savedKey(),request.signal);
      if(result.order&&['cancelled','expired','paid','test_paid'].includes(result.order.state))result=await prepareQuickBuy(documentId,savedKey(true),request.signal);
      if(request.signal.aborted||activeUser.current!==userId)return;
      setOrder(result.order);setPurchase(result.purchase);
      if(result.order)rememberOrder(result.order.id);
    }catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Не удалось подготовить оплату.')}
    finally{if(!request.signal.aborted)setLoading(false)}
  }
  async function pay(){
    if(!order||paying||loading||!user)return;
    setPaying(true);setError('');const request=controller.current!,userId=user.id;
    try{
      const result=await payQuickBuy(order.id,request.signal);
      if(request.signal.aborted||activeUser.current!==userId)return;
      if(['paid','test_paid'].includes(result.order.state)){completeOrder(result.order);close();router.push('/checkout/'+result.order.id)}
      else if(result.href)window.location.assign(result.href);
      else setError('Платёж обрабатывается. Повторите проверку через несколько секунд.');
    }catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Не удалось начать оплату.')}
    finally{if(!request.signal.aborted)setPaying(false)}
  }
  return <>
    <button ref={button} type="button" className={className} tabIndex={tabIndex} disabled={!available||authLoading} title={available?'Оплатить без добавления в корзину':'Покупка пока недоступна'} onClick={()=>{if(!user)setAuth(true);else void prepare()}} aria-label={'Купить: '+title}><ShoppingBag size={13} aria-hidden="true"/>Купить{!available&&<small> скоро</small>}</button>
    {(open||auth)&&typeof document!=='undefined'&&createPortal(<div ref={dialog} onClick={event=>{event.stopPropagation();if(event.target instanceof Element&&event.target.classList.contains('auth-screen')){close();setAuth(false)}}}>
      {auth?<AuthModal isOpen onClose={()=>setAuth(false)}/>:<AuthScreen><AuthPanel title={purchase?'Уже куплено':'Оплата'} dialog onClose={close} closeLabel="Закрыть оплату"><AuthStack>
        <p className="auth-copy">{title}</p>
        {loading&&<p className="auth-copy" role="status">Подготавливаем заказ…</p>}
        {error&&<AuthNotice kind="error">{error}</AuthNotice>}
        {purchase?<><AuthNotice>Вы уже оплатили этот товар. Повторная оплата не требуется.</AuthNotice><OrderDownload order={purchase.orderId} wallpaper={documentId} download={purchase.download}/><Link href="/account#orders" className="auth-button" onClick={close}>Мои покупки</Link></>:<>
          {order&&<p className="auth-copy">{(order.totalKopecks/100).toLocaleString('ru-RU',{style:'currency',currency:'RUB'})}</p>}
          <PaymentMethods enabled={!!order&&!loading} pending={paying} onPay={()=>void pay()}/>
          {!loading&&!order&&<button className="auth-button" onClick={()=>void prepare()}>Повторить</button>}
          <p className="auth-copy">Тестовая оплата ЮKassa. Реальные деньги не списываются.</p>
        </>}
      </AuthStack></AuthPanel></AuthScreen>}
    </div>,document.body)}
  </>;
}
