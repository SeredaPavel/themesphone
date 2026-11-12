'use client';
import {useEffect,useState} from 'react';
import {FcGoogle} from 'react-icons/fc';
import {FaTelegramPlane} from 'react-icons/fa';
const names:Record<string,string>={google:'Google',yandex:'Яндекс',telegram:'Telegram'};
export default function SocialButtons({variant='default'}:{variant?:'default'|'glass'}) {
  const [enabled,setEnabled]=useState<string[]>([]);
  useEffect(()=>{
    const abort=new AbortController();
    fetch('/api/auth/providers',{cache:'no-store',signal:abort.signal}).then(res=>res.json()).then(data=>setEnabled((data.providers || []).filter((item:any)=>item.enabled).map((item:any)=>item.provider))).catch(()=>{});
    return ()=>abort.abort();
  },[]);
  return <>{Object.entries(names).map(([provider,name])=>{
    const button=<button type="submit" disabled={!enabled.includes(provider)} className={variant==='glass'?'auth-choice-button':'liquid-pill !justify-start w-full disabled:opacity-60 disabled:cursor-not-allowed'}>
      {provider==='google'?<FcGoogle className="text-xl bg-white rounded-full p-0.5"/>:provider==='telegram'?<FaTelegramPlane className="text-xl text-[#229ED9]"/>:<span className={variant==='glass'?'auth-choice-button__yandex':'w-6 h-6 flex items-center justify-center rounded-full bg-[#fc3f1d] text-white font-bold text-xs'}>Y</span>}
      <span>Войти через {name}{variant!=='glass' && !enabled.includes(provider)?' (скоро)':''}</span>
    </button>;
    return <form key={provider} method="post" action={'/api/connect/'+provider} className={variant==='glass'?'auth-choice-row':undefined}>
      {variant==='glass'?<div className="auth-choice-row__content"><div className="auth-choice-row__slot">{button}</div></div>:button}
    </form>;
  })}</>;
}
