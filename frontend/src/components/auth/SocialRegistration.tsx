'use client';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import FormField from '@/components/FormField';
import {oauthMessages} from '@/lib/oauth-messages';
export default function SocialRegistration() {
  const params=useSearchParams();
  const code=params.get('error');
  const [ready,setReady]=useState(false);
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState(code ? Object.hasOwn(oauthMessages,code)?oauthMessages[code]:'Вход через сервис временно недоступен.' : '');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    if(code) return;
    const abort=new AbortController();
    fetch('/api/auth/oauth/pending',{cache:'no-store',signal:abort.signal}).then(async res=>{const data=await res.json();if(!res.ok) throw Error(data.error);setEmail(data.email || '');setReady(true);}).catch(error=>{if(!abort.signal.aborted)setError(error.message);});
    return ()=>abort.abort();
  },[code]);
  return <section className="form-panel w-full max-w-lg mx-auto flex flex-col gap-5">
    <p className="form-eyebrow">ThemesPhone · Вход через сервис</p>
    <h1 className="!text-4xl sm:!text-5xl">{done?'Подтвердите почту':'Завершение входа'}</h1>
    {done?<p role="status" className="form-message">{message}</p>:ready?<form className="flex flex-col gap-5" onSubmit={async event=>{
      event.preventDefault();if(busy)return;setBusy(true);setError('');
      try {
        const res=await fetch('/api/auth/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
        const data=await res.json();if(!res.ok) throw Error(data.error);
        setDone(true);setMessage(data.mailSent?'Откройте ссылку в письме. Затем вернитесь на сайт и войдите через выбранный сервис.':'Аккаунт создан, но письмо не отправлено. Запросите подтверждение повторно кнопкой ниже.');
      } catch(error){setError(error instanceof Error?error.message:'Нет соединения');}
      finally{setBusy(false);}
    }}>
      <p className="form-muted text-sm">Для нового аккаунта укажите email и подтвердите его письмом. Если аккаунт уже есть, войдите привычным способом и подключите сервис в личном кабинете.</p>
      <FormField label="Email" value={email} onChange={event=>setEmail(event.target.value)} type="email" autoComplete="email" maxLength={254} required disabled={busy}/>
      <button type="submit" disabled={busy} className="liquid-pill liquid-pill--accent self-start">{busy?'Подождите…':'Создать аккаунт'}</button>
    </form>:!error?<p>Проверяем запрос входа…</p>:null}
    {done && <button type="button" disabled={busy} className="liquid-pill self-start" onClick={async()=>{
      setBusy(true);setError('');
      try {const res=await fetch('/api/auth/resend-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const data=await res.json();if(!res.ok)throw Error(data.error);setMessage('Если аккаунт ещё не подтверждён, письмо отправлено повторно.');}
      catch(error){setError(error instanceof Error?error.message:'Нет соединения');}finally{setBusy(false);}
    }}>Отправить подтверждение повторно</button>}
    {error && <p role="alert" className="form-message form-message--error">{error}</p>}
    <Link href="/?auth=popup" className="liquid-pill self-start">Вернуться ко входу</Link>
  </section>;
}
