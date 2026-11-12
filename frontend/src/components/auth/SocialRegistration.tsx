'use client';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import FormField from '@/components/FormField';
import {oauthMessages} from '@/lib/oauth-messages';
import AuthPanel, {AuthNotice,AuthStack} from './AuthSurface';

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
  async function resend() {
    if(busy)return;
    setBusy(true);setError('');
    try {const res=await fetch('/api/auth/resend-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const data=await res.json();if(!res.ok)throw Error(data.error);setMessage('Если аккаунт ещё не подтверждён, письмо отправлено повторно.');}
    catch(error){setError(error instanceof Error?error.message:'Нет соединения');}finally{setBusy(false);}
  }
  const title=done?'Подтвердите почту':ready?'Продолжение входа':error?'Не удалось войти':'Продолжение входа';
  const back=<Link key="back" href="/?auth=popup" className="auth-button">Вернуться ко входу</Link>;
  return <AuthPanel title={title}>
    {done ? <AuthStack>
      <AuthNotice key="success" kind="success">{message}</AuthNotice>
      {error && <AuthNotice key="error" kind="error">{error}</AuthNotice>}
      <button key="resend" type="button" disabled={busy} className="auth-button" onClick={resend}>{busy?'Отправка…':'Отправить письмо повторно'}</button>
      {back}
    </AuthStack> : ready ? <form aria-label="Продолжение входа" onSubmit={async event=>{
      event.preventDefault();if(busy)return;setBusy(true);setError('');
      try {
        const res=await fetch('/api/auth/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
        const data=await res.json();if(!res.ok) throw Error(data.error);
        setDone(true);setMessage(data.mailSent?'Откройте ссылку в письме. Затем вернитесь на сайт и войдите через выбранный сервис.':'Аккаунт создан, но письмо не отправлено. Запросите подтверждение повторно кнопкой ниже.');
      } catch(error){setError(error instanceof Error?error.message:'Нет соединения');}
      finally{setBusy(false);}
    }}><AuthStack>
      <p key="help" className="auth-copy">Для продолжения укажите email и подтвердите его письмом. Если аккаунт уже есть, войдите привычным способом и подключите сервис в личном кабинете.</p>
      <FormField key="email" label="Email" value={email} onChange={event=>setEmail(event.target.value)} type="email" autoComplete="email" maxLength={254} required disabled={busy}/>
      {error && <AuthNotice key="error" kind="error">{error}</AuthNotice>}
      <button key="submit" type="submit" disabled={busy} className="auth-button auth-button--primary">{busy?'Подождите…':'Создать аккаунт'}</button>
      {back}
    </AuthStack></form> : <AuthStack>
      {error?<AuthNotice key="error" kind="error">{error}</AuthNotice>:<p key="loading" role="status" className="auth-copy">Проверяем запрос входа…</p>}
      {error && back}
    </AuthStack>}
  </AuthPanel>;
}
