'use client';
import PasswordField from '@/components/PasswordField';
import FormField from '@/components/FormField';
import Link from 'next/link';
import {useState} from 'react';
import type {FormEvent} from 'react';
import {useAuthContext} from '@/context/AuthContext';
type PasswordBlockProps = {
  email: string|null;
  hasPassword?: boolean;
  providers?: string[];
};
export default function PasswordBlock({email,hasPassword=true,providers=[]}:PasswordBlockProps) {
  const {setUser}=useAuthContext();
  const [current,setCurrent]=useState('');
  const [password,setPassword]=useState('');
  const [repeat,setRepeat]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [mergeSuggestion,setMergeSuggestion]=useState(false);
  const [contactEmail,setContactEmail]=useState(email || '');
  const [linkKind,setLinkKind]=useState<'email'|'password'>('password');
  async function createPassword(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy) return;
    const kind=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='email'?'email':'password';
    const target=email || contactEmail.trim();
    setLinkKind(kind);
    setBusy(true);setError('');setMessage('');setMergeSuggestion(false);
    try {
      const res=await fetch('/api/account/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind==='email'?'add-email':'create-password',email:target})});
      const data=await res.json();
      if(!res.ok) {setMergeSuggestion(data.code==='email_in_use');throw new Error(data.error || 'Не удалось отправить ссылку');}
      setMessage(kind==='email'?'Письмо отправлено на '+target+'. Подтвердите адрес по ссылке в письме.':'Письмо отправлено на '+target+'. По ссылке можно создать пароль для этого аккаунта.');
    } catch(error) {setError(error instanceof Error?error.message:'Нет соединения. Повторите позже');}
    finally {setBusy(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy) return;
    setError('');setMessage('');
    if(password!==repeat || password.length<10 || current===password) {setError('Пароли должны совпадать, содержать не менее 10 символов и отличаться от текущего');return;}
    setBusy(true);
    try {
      const res=await fetch('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:current,password,passwordConfirmation:repeat})});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error || 'Не удалось сменить пароль');
      setUser(data.user);setCurrent('');setPassword('');setRepeat('');setMessage('Пароль изменён');
    } catch(error) {setError(error instanceof Error?error.message:'Нет соединения. Повторите позже');}
    finally {setBusy(false);}
  }
  if(!hasPassword) return <form id="account-password" onSubmit={createPassword} aria-label="Создание пароля" className="form-panel flex flex-col gap-5">
    <h2>Пароль не задан</h2>
    {providers.length>0 && <p className="text-sm form-muted">Авторизация: {providers.join(', ')}</p>}
    <p className="text-sm form-muted">{email?<>Создайте пароль, чтобы также входить по email. Отправим ссылку на {email}.</>:'Вы можете продолжать входить через сервис. Добавьте почту для писем или создайте пароль для входа по email.'}</p>
    {!email && <FormField label="Email" type="email" value={contactEmail} onChange={event=>setContactEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required maxLength={254} disabled={busy}/>}
    {error && <p role="alert" className="form-message form-message--error">{error}</p>}
    {mergeSuggestion && <Link href="/auth/login" className="liquid-pill self-start">Войти по почте и объединить профили</Link>}
    {message && <p role="status" className="form-message">{message}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="submit" value="password" disabled={busy} className="liquid-pill liquid-pill--accent">{busy && linkKind==='password'?'Отправка…':'Создать пароль'}</button>
      {!email && <button type="submit" value="email" disabled={busy} className="liquid-pill">{busy && linkKind==='email'?'Отправка…':'Подтвердить только почту'}</button>}
    </div>
  </form>;
  return <form onSubmit={submit} aria-label="Смена пароля" className="form-panel flex flex-col gap-5">
    <h2>Смена пароля</h2>
    <p className="text-sm form-muted">Используйте пароль от 10 до 256 символов.</p>
    <PasswordField label="Текущий пароль" value={current} onChange={event=>setCurrent(event.target.value)} placeholder="Текущий пароль" autoComplete="current-password" required maxLength={256} disabled={busy}/>
    <PasswordField label="Новый пароль" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Новый пароль" autoComplete="new-password" required minLength={10} maxLength={256} disabled={busy}/>
    <PasswordField label="Повторите пароль" value={repeat} onChange={event=>setRepeat(event.target.value)} placeholder="Повторите новый пароль" autoComplete="new-password" required minLength={10} maxLength={256} disabled={busy}/>
    {error && <p role="alert" className="form-message form-message--error">{error}</p>}
    {message && <p role="status" className="form-message">{message}</p>}
    <button type="submit" disabled={busy} className="liquid-pill liquid-pill--accent self-start">{busy?'Сохранение…':'Сменить пароль'}</button>
  </form>;
}
