'use client';

import {useId,useState} from 'react';
import {ArrowDownRight,ArrowUpRight,RotateCcw,ShoppingBag,ShoppingCart} from 'lucide-react';
import styles from './phone-card.module.css';

type Product={title:string;imageUrl:string;category:string;price:string};

export default function PhoneCardPrototype({product}:{product:Product}) {
  const [hovered,setHovered]=useState(false);
  const [pinned,setPinned]=useState(false);
  const [keyboardFocus,setKeyboardFocus]=useState(false);
  const [failedImage,setFailedImage]=useState(false);
  const [notice,setNotice]=useState('');
  const detailsId=useId();
  const expanded=hovered || pinned || keyboardFocus;
  function demonstrate(action:string) {
    setNotice(`«${action}» — демонстрационная кнопка. Сейчас проверяем только вид и движение карточки.`);
  }
  return <section className={styles.preview} aria-label="Прототип карточки в рамке телефона">
    <div className={styles.intro}>
      <p className={styles.eyebrow}><span />ПРИМЕРКА ОБОЕВ <span className={styles.edition}>/ 01</span></p>
      <h1 className={styles.title}>Сначала —<br /><em>на вашем экране.</em></h1>
      <p className={styles.description}>Наведите на телефон: обои приблизятся, рамка развернётся, а подробности появятся снизу.</p>
      <button type="button" className={styles.previewButton} aria-pressed={pinned} onClick={()=>{setPinned(!pinned);setKeyboardFocus(false);}}>
        {pinned?<RotateCcw size={15} />:<ArrowUpRight size={16} />}
        {pinned?'Вернуть ракурс':'Показать раскрытой'}
      </button>
      <p className={styles.touchHint}>На телефоне — коснитесь экрана.</p>
      <p className={styles.prototypeNote}>Один тестовый вариант. Кнопки покупки и корзины — для просмотра.</p>
      <p className={styles.feedback} role="status" aria-live="polite">{notice}</p>
    </div>

    <div className={styles.stage}>
      <span className={styles.orbit} aria-hidden="true" />
      <div className={styles.interactionZone} data-expanded={expanded}
        onPointerEnter={event=>{if(event.pointerType==='mouse')setHovered(true);}}
        onPointerLeave={()=>setHovered(false)}
        onFocusCapture={event=>{if(event.target.matches(':focus-visible'))setKeyboardFocus(true);}}
        onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setKeyboardFocus(false);}}
        onKeyDown={event=>{if(event.key==='Escape'){setPinned(false);setKeyboardFocus(false);(document.activeElement as HTMLElement)?.blur();}}}>
        <article className={styles.phone} aria-label={product.title}>
          <div className={styles.back} aria-hidden="true" />
          <span className={`${styles.sideButton} ${styles.actionButton}`} aria-hidden="true" />
          <span className={`${styles.sideButton} ${styles.volumeUp}`} aria-hidden="true" />
          <span className={`${styles.sideButton} ${styles.volumeDown}`} aria-hidden="true" />
          <span className={`${styles.sideButton} ${styles.powerButton}`} aria-hidden="true" />
          <div className={styles.shell}>
            <div className={styles.screen}>
              <button type="button" className={styles.wallpaperToggle} aria-label={expanded?'Свернуть карточку обоев':'Рассмотреть обои и показать подробности'}
                aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setPinned(!pinned)}>
                {failedImage?<span className={styles.imageFallback}>Изображение временно недоступно</span>:<img className={styles.wallpaper} src={product.imageUrl} alt={product.title} onError={()=>setFailedImage(true)} />}
                <span className={styles.screenLight} aria-hidden="true" />
              </button>
              <div className={styles.statusBar} aria-hidden="true">
                <span>9:41</span>
                <svg width="40" height="10" viewBox="0 0 40 10" fill="currentColor"><path d="M1 6h2v3H1zm4-2h2v5H5zm4-2h2v7H9z"/><path d="M15 3a7 7 0 0 1 10 0l-1.2 1.2a5.4 5.4 0 0 0-7.6 0zm2.2 2.2a4 4 0 0 1 5.6 0L20 8z"/><rect x="29" y="1" width="9" height="7" rx="2" fill="none" stroke="currentColor"/><path d="M39 3h1v3h-1zM31 3h5v3h-5z"/></svg>
              </div>
              <span className={styles.island} aria-hidden="true"><i /></span>
              <div id={detailsId} className={styles.details} aria-hidden={!expanded}>
                <div className={styles.productHeading}><h2 title={product.title}>{product.title}</h2><span className={styles.price}>{product.price}</span></div>
                <div className={styles.tags}><span>{product.category}</span><span>iPhone</span></div>
                <div className={styles.actions}>
                  <button type="button" tabIndex={expanded?0:-1} onClick={()=>demonstrate('Купить')} className={styles.buy}><ShoppingBag size={13} />Купить</button>
                  <button type="button" tabIndex={expanded?0:-1} onClick={()=>demonstrate('В корзину')}><ShoppingCart size={13} />В корзину</button>
                </div>
              </div>
              <span className={styles.homeIndicator} aria-hidden="true" />
            </div>
          </div>
        </article>
      </div>
      <div className={styles.caption}><span className={styles.captionLine} /><div><p>iPhone <span>· эскиз рамки</span></p><small>{expanded?'Обои и подробности':'Наведите или коснитесь'}<ArrowDownRight size={12} /></small></div></div>
    </div>
  </section>;
}
