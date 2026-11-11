'use client';
import PasswordField from '@/components/PasswordField';
import {useState} from 'react';
import type {FormEvent} from 'react';
import {useAuthContext} from '@/context/AuthContext';
export default function PasswordBlock() {
  const {setUser}=useAuthContext();
  const [current,setCurrent]=useState('');
  const [password,setPassword]=useState('');
  const [repeat,setRepeat]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
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
