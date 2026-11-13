'use client';

import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import PasswordField from '@/components/PasswordField';
import AuthPanel,{AuthNotice,AuthStack} from './AuthSurface';
import {oauthMessages} from '@/lib/oauth-messages';

const names:Record<string,string>={google:'Google',yandex:'Яндекс',telegram:'Telegram'};
type Preview={provider:string;primaryEmail:string|null;primaryIsCurrent:boolean;providers:string[];orderCount:number;requiresPassword:boolean;verified:boolean;proofProviders:string[]};

export default function AccountMergeForm() {
  const params=useSearchParams();
  const callbackError=params.get('error');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [password,setPassword]=useState('');
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(callbackError?(oauthMessages[callbackError] || 'Не удалось подтвердить вход. Попробуйте снова.'):'');
  useEffect(()=>{
    const abort=new AbortController();
    fetch('/api/account/connections?view=merge',{cache:'no-store',signal:abort.signal}).then(async response=>{
      const data=await response.json();
      if(!response.ok) throw Error(data.error || 'Объединение временно недоступно');
      setPreview(data);
    }).catch(error=>{if(!abort.signal.aborted)setError(error.message);});
    return ()=>abort.abort();
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy || !consent)return;
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/account/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'merge-accounts',confirm:consent,password})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error || 'Не удалось объединить профили');
      window.location.replace('/account?merged=1');
    } catch(error){setError(error instanceof Error?error.message:'Нет соединения. Попробуйте снова.');setPassword('');setBusy(false);}
  }
  async function cancel() {
    if(busy)return;setBusy(true);
    try {await fetch('/api/account/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel-merge'})});}
    catch { /* Cancelling must also let the user leave when the network is down. */ }
    finally {window.location.replace('/account');}
  }
  const canConfirm=!!preview && (preview.verified || (preview.requiresPassword && !!password));
  return <AuthPanel title="Объединение аккаунтов">
    {!preview?<AuthStack>
      {error?<AuthNotice key="error" kind="error">{error}</AuthNotice>:<p key="loading" className="auth-copy" role="status">Проверяем профили…</p>}
      {error && <Link key="back" href="/account" className="auth-button">Вернуться в кабинет</Link>}
    </AuthStack>:<>
      <AuthStack>
        <p key="intro" className="auth-copy">Этот аккаунт {names[preview.provider] || 'сервиса'} уже связан с другим профилем ThemesPhone. Объедините профили, чтобы пользоваться всеми способами входа в одном кабинете.</p>
        <AuthNotice key="summary">
          {preview.primaryEmail?<>Для входа по почте сохранится <strong>{preview.primaryEmail}</strong>.</>:<>После объединения можно добавить почту и создать пароль.</>}
          {' '}Покупки и подключённые сервисы сохранятся. Заполненные поля основного профиля останутся прежними.
          {preview.orderCount>0 && <> Перенесём заказов: {preview.orderCount}.</>}
          <span className="block mt-2">Способы входа: {preview.providers.map(provider=>names[provider] || provider).join(', ')}.</span>
        </AuthNotice>
        {!preview.primaryIsCurrent && <p key="primary" className="auth-copy">Основным станет ваш профиль с уже добавленной почтой. После объединения откроется его кабинет.</p>}
        {preview.verified && <AuthNotice key="verified" kind="success">Вход в текущий профиль подтверждён.</AuthNotice>}
        {!preview.verified && !preview.requiresPassword && <p key="proof" className="auth-copy">Теперь подтвердите текущий профиль через один из подключённых к нему сервисов.</p>}
      </AuthStack>
      {!preview.verified && !preview.requiresPassword && <AuthStack>
        {preview.proofProviders.map(provider=><form key={provider} method="post" action={'/api/connect/'+provider}>
          <input type="hidden" name="mode" value="merge-verify" />
          <button type="submit" className="auth-button" disabled={busy}>Подтвердить через {names[provider] || provider}</button>
        </form>)}
        {!preview.proofProviders.length && <AuthNotice key="unavailable" kind="error">Сервисы текущего профиля временно недоступны. Попробуйте объединить аккаунты позднее.</AuthNotice>}
      </AuthStack>}
      <form onSubmit={submit} aria-label="Подтверждение объединения аккаунтов"><AuthStack>
        {!preview.verified && preview.requiresPassword && <PasswordField key="password" label="Пароль текущего аккаунта" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required maxLength={256} disabled={busy} />}
        <label key="consent" className="auth-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} required disabled={busy || !canConfirm} /><span>Подтверждаю объединение этих двух аккаунтов в один.</span></label>
        {error && <AuthNotice key="error" kind="error">{error}</AuthNotice>}
        <button key="submit" type="submit" className="auth-button auth-button--primary" disabled={busy || !canConfirm || !consent}>{busy?'Объединяем…':'Объединить аккаунты'}</button>
        <button key="cancel" type="button" className="auth-link" onClick={cancel} disabled={busy}>Отмена — оставить профили отдельно</button>
      </AuthStack></form>
    </>}
  </AuthPanel>;
}
