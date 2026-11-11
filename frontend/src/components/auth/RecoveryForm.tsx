'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import FormField from '@/components/FormField';
import PasswordField from '@/components/PasswordField';

export default function RecoveryForm({reset=false}:{reset?:boolean}) {
  const params=useSearchParams();
  const code=params.get('code') || '';
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [repeat,setRepeat]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState('');
  const invalidCode=reset && !/^[a-f0-9]{128}$/.test(code);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy) return;
    setError('');
    if(reset && (password.length<10 || password!==repeat)) {setError('Пароли должны совпадать и содержать не менее 10 символов');return;}
    setBusy(true);
    try {
      const res=await fetch('/api/auth/'+(reset?'reset-password':'forgot-password'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reset?{code,password,passwordConfirmation:repeat}:{email})});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error || 'Не удалось выполнить запрос. Повторите позже');
      setDone(true); setPassword(''); setRepeat('');
      if(reset) window.history.replaceState(null,'','/auth/reset-password');
    } catch(error) {setError(error instanceof Error?error.message:'Нет соединения. Повторите позже');}
    finally {setBusy(false);}
  }
  return <section className="form-panel w-full max-w-lg mx-auto">
    <p className="form-eyebrow mb-3">ThemesPhone · Личный кабинет</p>
    <h1 className="!text-4xl sm:!text-5xl mb-4">{reset?'Новый пароль':'Восстановление пароля'}</h1>
    {done ? <div className="space-y-5">
      <p role="status" className="form-message">{reset?'Пароль изменён. Теперь войдите с новым паролем.':'Если аккаунт с таким email существует, на него отправлена ссылка восстановления. Проверьте входящие и папку «Спам».'}</p>
      <Link href="/?auth=popup" className="liquid-pill liquid-pill--accent">Вернуться ко входу</Link>
    </div> : invalidCode ? <div className="space-y-5">
      <p role="alert" className="form-message form-message--error">Ссылка восстановления отсутствует или некорректна.</p>
      <Link href="/auth/forgot-password" className="liquid-pill">Получить новую ссылку</Link>
    </div> : <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="form-muted text-sm leading-relaxed">{reset?'Придумайте пароль от 10 до 256 символов. Ссылка действует один час и может быть использована только один раз.':'Введите email вашего аккаунта. Мы отправим ссылку, по которой можно задать новый пароль.'}</p>
      {reset ? <>
        <PasswordField label="Новый пароль" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="new-password" required minLength={10} maxLength={256} disabled={busy}/>
        <PasswordField label="Повторите пароль" value={repeat} onChange={event=>setRepeat(event.target.value)} autoComplete="new-password" required minLength={10} maxLength={256} disabled={busy}/>
      </> : <FormField label="Email" type="email" placeholder="name@example.com" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" maxLength={254} required disabled={busy}/>}
      {error && <p role="alert" className="form-message form-message--error">{error}</p>}
      {reset && error && <Link href="/auth/forgot-password" className="text-sm underline">Запросить новую ссылку</Link>}
      <button type="submit" disabled={busy} className="liquid-pill liquid-pill--accent self-start">{busy?'Подождите…':reset?'Сохранить новый пароль':'Отправить ссылку'}</button>
      <Link href="/?auth=popup" className="form-muted text-sm underline self-start">Вернуться ко входу</Link>
    </form>}
  </section>;
}
