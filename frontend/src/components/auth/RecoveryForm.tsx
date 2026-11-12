'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import FormField from '@/components/FormField';
import PasswordField from '@/components/PasswordField';
import AuthPanel, { AuthNotice, AuthStack } from './AuthSurface';

export default function RecoveryForm({reset=false}:{reset?:boolean}) {
  const params=useSearchParams();
  const code=params.get('code') || '';
  const setup=reset && params.get('setup')==='1';
  const newLink=setup?'/account#account-password':'/auth/forgot-password';
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
      if(reset) window.history.replaceState(null,'','/auth/reset-password'+(setup?'?setup=1':''));
    } catch(error) {setError(error instanceof Error?error.message:'Нет соединения. Повторите позже');}
    finally {setBusy(false);}
  }
  const title=setup?'Создание пароля':reset?'Новый пароль':'Восстановление пароля';
  return <AuthPanel title={title}>
    {done ? <AuthStack>
      <AuthNotice key="success" kind="success">{setup?'Пароль создан. Теперь можно входить по email и паролю или через подключённый сервис.':reset?'Пароль изменён. Теперь войдите с новым паролем.':'Если аккаунт с таким email существует, на него отправлена ссылка восстановления. Проверьте входящие и папку «Спам».'}</AuthNotice>
      <Link key="back" href="/?auth=popup" className="auth-button auth-button--primary">Вернуться ко входу</Link>
    </AuthStack> : invalidCode ? <AuthStack>
      <AuthNotice key="invalid" kind="error">Ссылка восстановления отсутствует или некорректна.</AuthNotice>
      <Link key="new-link" href={newLink} className="auth-button">{setup?'Получить ссылку в кабинете':'Получить новую ссылку'}</Link>
      <Link key="back" href="/?auth=popup" className="auth-link">Вернуться ко входу</Link>
    </AuthStack> : <form onSubmit={submit} aria-label={title}>
      <AuthStack>
        <p key="help" className="auth-copy">{reset?'Придумайте пароль от 10 до 256 символов. Ссылка действует один час и может быть использована только один раз.':'Введите email вашего аккаунта. Мы отправим ссылку, по которой можно задать новый пароль.'}</p>
        {reset && <PasswordField key="password" label="Новый пароль" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="new-password" required minLength={10} maxLength={256} disabled={busy}/>}
        {reset && <PasswordField key="repeat" label="Повторите пароль" value={repeat} onChange={event=>setRepeat(event.target.value)} autoComplete="new-password" required minLength={10} maxLength={256} disabled={busy}/>}
        {!reset && <FormField key="email" label="Email" type="email" placeholder="name@example.com" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" maxLength={254} required disabled={busy}/>}
        {error && <AuthNotice key="error" kind="error">{error}</AuthNotice>}
        {reset && error && <Link key="resend" href={newLink} className="auth-link">{setup?'Запросить ссылку в кабинете':'Запросить новую ссылку'}</Link>}
        <button key="submit" type="submit" disabled={busy} className="auth-button auth-button--primary">{busy?'Подождите…':reset?'Сохранить новый пароль':'Отправить ссылку'}</button>
        <Link key="back" href="/?auth=popup" className="auth-link">Вернуться ко входу</Link>
      </AuthStack>
    </form>}
  </AuthPanel>;
}
