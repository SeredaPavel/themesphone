'use client';
import {useEffect,useState} from 'react';
import {FcGoogle} from 'react-icons/fc';
import {FaTelegramPlane} from 'react-icons/fa';
const names:Record<string,string>={google:'Google',yandex:'Яндекс',telegram:'Telegram'};
export default function SocialButtons() {
  const [enabled,setEnabled]=useState<string[]>([]);
  useEffect(()=>{
    const abort=new AbortController();
    fetch('/api/auth/providers',{cache:'no-store',signal:abort.signal}).then(res=>res.json()).then(data=>setEnabled((data.providers || []).filter((item:any)=>item.enabled).map((item:any)=>item.provider))).catch(()=>{});
    return ()=>abort.abort();
  },[]);
  return <>{Object.entries(names).map(([provider,name])=><form key={provider} method="post" action={'/api/connect/'+provider}>
    <button type="submit" disabled={!enabled.includes(provider)} className="liquid-pill !justify-start w-full disabled:opacity-60 disabled:cursor-not-allowed">
      {provider==='google'?<FcGoogle className="text-xl bg-white rounded-full p-0.5"/>:provider==='telegram'?<FaTelegramPlane className="text-xl text-[#229ED9]"/>:<span className="w-6 h-6 flex items-center justify-center rounded-full bg-[#fc3f1d] text-white font-bold text-xs">Y</span>}
      Войти через {name}{!enabled.includes(provider)?' (скоро)':''}
    </button>
  </form>)}</>;
}
