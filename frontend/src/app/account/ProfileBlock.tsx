'use client';
import FormField from '@/components/FormField';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
type Profile={firstname:string;lastname:string;phone:string;billingAddress:string};
const fields=(user:any):Profile=>({firstname:user.firstname || '',lastname:user.lastname || '',phone:user.phone || '',billingAddress:user.billingAddress || ''});
export default function ProfileBlock({ user }: { user: any }) {
  const router=useRouter();
  const {setUser}=useAuthContext();
  const [saved,setSaved]=useState(()=>fields(user));
  const [draft,setDraft]=useState(saved);
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const change=(key:keyof Profile,value:string)=>setDraft(current=>({...current,[key]:value}));
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy || !editing) return;
    setBusy(true);setError('');setMessage('');
    try {
      const res=await fetch('/api/account/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error || 'Не удалось сохранить профиль');
      const next=fields(data.user);
      setSaved(next);setDraft(next);setEditing(false);setUser(data.user);setMessage('Профиль сохранён');router.refresh();
    } catch(error) {setError(error instanceof Error?error.message:'Нет соединения. Повторите позже');}
    finally {setBusy(false);}
  }
  return <form onSubmit={submit} aria-label="Мой профиль" className="form-panel flex flex-col gap-5">
    <h2>Мой профиль</h2>
    <div aria-hidden="true" className="w-20 h-20 rounded-full bg-[#deeded] text-[#337780] flex items-center justify-center text-2xl mx-auto">{(saved.firstname || user.username || user.email || '?').slice(0, 1).toUpperCase()}</div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FormField label="Имя" value={draft.firstname} onChange={event=>change('firstname',event.target.value)} disabled={!editing || busy} maxLength={80} placeholder="Ваше имя" autoComplete="given-name" />
      <FormField label="Фамилия" value={draft.lastname} onChange={event=>change('lastname',event.target.value)} disabled={!editing || busy} maxLength={80} placeholder="Ваша фамилия" autoComplete="family-name" />
    </div>
    <FormField label="Подтверждённый email" type="email" value={user.email} readOnly autoComplete="email" />
    <FormField label="Телефон" type="tel" value={draft.phone} onChange={event=>change('phone',event.target.value)} disabled={!editing || busy} maxLength={32} placeholder="Номер телефона" autoComplete="tel" />
    <FormField label="Адрес выставления счёта" value={draft.billingAddress} onChange={event=>change('billingAddress',event.target.value)} disabled={!editing || busy} maxLength={300} placeholder="Ваш адрес" autoComplete="street-address" />
    {error && <p role="alert" className="form-message form-message--error">{error}</p>}
    {message && <p role="status" className="form-message">{message}</p>}
    <div className="flex flex-wrap gap-2 mt-2">
      {editing ? <>
        <button type="button" disabled={busy} onClick={()=>{setDraft(saved);setEditing(false);setError('');}} className="liquid-pill">Отмена</button>
        <button type="submit" disabled={busy} className="liquid-pill liquid-pill--accent">{busy?'Сохранение…':'Сохранить'}</button>
      </> : <button type="button" onClick={()=>{setEditing(true);setMessage('');setError('');}} className="liquid-pill">Редактировать</button>}
    </div>
  </form>;
}
