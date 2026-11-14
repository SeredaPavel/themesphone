'use client';

import Link from 'next/link';
import {useEffect,useId,useState} from 'react';
import type {MouseEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowUpRight,Check,Download,ShoppingBag,ShoppingCart} from 'lucide-react';
import {useCart} from '@/context/CartContext';
import {useAuthContext} from '@/context/AuthContext';
import {wallpaperDetailHref} from '@/lib/catalog-query';
import {rememberCatalogScroll} from '@/lib/catalog-scroll';
import AuthModal from './AuthModal';
import PhoneFrame from './PhoneFrame';
import DownloadLink from './DownloadLink';
import {validOriginal} from '@/lib/download-links';
import type {OriginalFile} from '@/lib/download-links';
import {useWallpaperPreview} from './WallpaperPreviewGroup';
import type {PhoneDevice} from './PhoneFrame';
import {commerceMessages} from './CommerceNotice';
import styles from './WallpaperCard.module.css';

type Props={id:number;documentId?:string;returnTo?:string;title:string;imageUrl:string;isFree:boolean|null;price?:number;device?:{title:string;slug:string}|null;category?:{title:string;slug:string}|null;compact?:boolean;originalFile?:OriginalFile|null};

export default function WallpaperCard({id,documentId,returnTo,title,imageUrl,isFree,price,device,category,compact=false,originalFile}:Props) {
  const [hovered,setHovered]=useState(false);
  const [keyboardFocus,setKeyboardFocus]=useState(false);
  const [added,setAdded]=useState(false);
  const [isAuthOpen,setIsAuthOpen]=useState(false);
  const previewId=documentId || String(id);
  const mobilePreview=useWallpaperPreview(previewId);
  const expanded=mobilePreview || hovered || keyboardFocus;
  const detailsId=useId(),availabilityId=useId();
  const detailUrl=wallpaperDetailHref(documentId || String(id),returnTo);
  const rememberPosition=()=>{if(returnTo)rememberCatalogScroll(returnTo);};
  const slug=device?.slug?.toLowerCase();
  const frame:PhoneDevice=slug==='android'?'android':slug==='iphone'?'iphone':'generic';
  const {addToCart}=useCart();
  const {user}=useAuthContext();
  const router=useRouter();

  useEffect(()=>{if(!added)return;const timer=setTimeout(()=>setAdded(false),2000);return()=>clearTimeout(timer);},[added]);

  function openProduct(event:MouseEvent<HTMLElement>) {
    if(event.defaultPrevented || event.button!==0 || !(event.target instanceof Element) || event.target.closest('a,button,input,select,textarea,label,[role="button"]'))return;
    rememberPosition();
    if(event.ctrlKey || event.metaKey){window.open(detailUrl,'_blank','noopener,noreferrer');return;}
    router.push(detailUrl);
  }

  function add() {
    if(!user){setIsAuthOpen(true);return;}
    if(!price)return;
    addToCart({id,title,imageUrl,price});setAdded(true);
  }
  // Kept for the payment stage; the visible purchase button remains disabled.
  async function buy() {
    if(!price)return;
    try {
      const res=await fetch('/api/checkout/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{wallpapers:{connect:[id]},amount:price,paid:false,...(user?.id?{users_permission:user.id}:{})}})});
      const json=await res.json();
      if(json?.data?.id)router.push(`/checkout/${json.data.id}?from=${encodeURIComponent(window.location.pathname)}`);
    } catch { /* Purchase stays disabled until the server order/payment flow is ready. */ }
  }

  return <>
    <article className={`${styles.card}${compact?' '+styles.compact:''}`} aria-label={title} data-wallpaper-card data-compact={compact} data-preview-id={compact?undefined:previewId} onClick={openProduct}
      onPointerEnter={event=>{if(event.pointerType==='mouse')setHovered(true);}} onPointerLeave={()=>setHovered(false)}
      onFocusCapture={event=>{if(event.target.matches(':focus-visible'))setKeyboardFocus(true);}}
      onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setKeyboardFocus(false);}}
      onKeyDown={event=>{if(event.key==='Escape'){setHovered(false);setKeyboardFocus(false);if(document.activeElement instanceof HTMLElement)document.activeElement.blur();}}}>
      <PhoneFrame title={title} imageUrl={imageUrl} device={frame} expanded={expanded} detailsId={compact?undefined:detailsId}
        imageHref={detailUrl} onNavigate={rememberPosition}>
        {!compact && <>
          <div className={styles.heading}><h2><Link href={detailUrl} onClick={rememberPosition} tabIndex={expanded?0:-1} title={title} aria-label={`Открыть обои «${title}»`}><span>{title}</span><ArrowUpRight size={12} /></Link></h2><span className={styles.price}>{isFree?'Бесплатно':`${price ?? '—'} ₽`}</span></div>
          <div className={styles.tags}>{category && <span title={category.title}>{category.title}</span>}{device && <span>{frame==='iphone'?'iPhone':device.title}</span>}</div>
          <div className={styles.actions}>
            {isFree===true?(validOriginal(originalFile) && documentId
              ?<DownloadLink file={originalFile} wallpaper={documentId} returnTo={returnTo} tabIndex={expanded?0:-1} />
              :<button type="button" disabled title={commerceMessages.download} aria-describedby={availabilityId}><Download size={13} />Загрузить <small>скоро</small></button>):<>
              <button type="button" onClick={buy} disabled title={commerceMessages.purchase} aria-describedby={availabilityId} className={styles.buy}><ShoppingBag size={13} />Купить <small>скоро</small></button>
              <button type="button" onClick={add} tabIndex={expanded?0:-1} aria-label={added?`Добавлено: ${title}`:`В корзину: ${title}`} className={added?styles.added:''}>{added?<Check size={13} />:<ShoppingCart size={13} />}{added?'Добавлено':'В корзину'}</button>
            </>}
          </div>
          <span className="sr-only" id={availabilityId}>{commerceMessages[isFree?'download':'purchase']}</span>
        </>}
      </PhoneFrame>
      {compact && <h3 className={styles.compactTitle}><Link href={detailUrl} onClick={rememberPosition}>{title}</Link></h3>}
    </article>
    <AuthModal isOpen={isAuthOpen} onClose={()=>setIsAuthOpen(false)} />
  </>;
}
