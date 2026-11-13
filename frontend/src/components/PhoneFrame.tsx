'use client';

import Link from 'next/link';
import {useState} from 'react';
import type {ReactNode} from 'react';
import styles from './PhoneFrame.module.css';

export type PhoneDevice='iphone'|'android'|'generic';
type Props={title:string;imageUrl:string;device:PhoneDevice;expanded:boolean;onToggle?:()=>void;detailsId?:string;children?:ReactNode;imageHref?:string;onNavigate?:()=>void;className?:string};

function Artwork({imageUrl,title}:{imageUrl:string;title:string}) {
  const [failed,setFailed]=useState(false);
  return imageUrl && !failed?<img className={styles.wallpaper} src={imageUrl} alt={title} loading="lazy" decoding="async" onError={()=>setFailed(true)} />
    :<span className={styles.imageFallback}>Изображение пока недоступно</span>;
}

export default function PhoneFrame({title,imageUrl,device,expanded,onToggle,detailsId,children,imageHref,onNavigate,className=''}:Props) {
  const model=device==='android'?'Samsung Galaxy S26 Ultra':device==='iphone'?'iPhone 18 Pro Max':'Телефон';
  const artwork=<><Artwork key={imageUrl} imageUrl={imageUrl} title={title} /><span className={styles.screenLight} aria-hidden="true" /></>;
  return <div className={`${styles.scene} ${className}`} data-phone-frame={device} data-expanded={expanded}>
    <div className={styles.phone} data-phone-body aria-label={`Рамка ${model}`}>
      <div className={styles.back} aria-hidden="true" />
      {device!=='generic' && <>
        {device==='iphone' && <span className={`${styles.sideButton} ${styles.actionButton}`} aria-hidden="true" />}
        <span className={`${styles.sideButton} ${styles.volumeUp}`} aria-hidden="true" />
        <span className={`${styles.sideButton} ${styles.volumeDown}`} aria-hidden="true" />
        <span className={`${styles.sideButton} ${styles.powerButton}`} aria-hidden="true" />
      </>}
      <div className={styles.shell}><div className={styles.screen} data-phone-screen>
        {imageHref?<Link href={imageHref} onClick={onNavigate} className={styles.wallpaperToggle} aria-label={`Открыть обои «${title}»`}>{artwork}</Link>
          :<button type="button" className={styles.wallpaperToggle} aria-label={`${expanded?'Свернуть':'Рассмотреть'} обои «${title}»`} aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>{artwork}</button>}
        <div className={styles.statusBar} aria-hidden="true"><span>9:41</span>
          <svg width="40" height="10" viewBox="0 0 40 10" fill="currentColor"><path d="M1 6h2v3H1zm4-2h2v5H5zm4-2h2v7H9z"/><path d="M15 3a7 7 0 0 1 10 0l-1.2 1.2a5.4 5.4 0 0 0-7.6 0zm2.2 2.2a4 4 0 0 1 5.6 0L20 8z"/><rect x="29" y="1" width="9" height="7" rx="2" fill="none" stroke="currentColor"/><path d="M39 3h1v3h-1zM31 3h5v3h-5z"/></svg>
        </div>
        {device==='iphone' && <span className={styles.island} aria-hidden="true"><i /></span>}
        {device==='android' && <span className={styles.camera} aria-hidden="true" />}
        {children && <div id={detailsId} className={styles.details} aria-hidden={!expanded} data-phone-details>{children}</div>}
        <span className={styles.homeIndicator} aria-hidden="true" />
      </div></div>
    </div>
  </div>;
}
