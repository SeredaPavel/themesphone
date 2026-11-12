'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaEye, FaEyeSlash, FaWandMagicSparkles } from 'react-icons/fa6';
import { useAuthContext } from '@/context/AuthContext';
import { loginUser } from '@/lib/auth';
import FormField from '@/components/FormField';
import AuthPanel, { AuthNotice, AuthStack } from './AuthSurface';

export default function EmailAuthForm({ dialog = false, onBack, onNavigate, onAuthenticated }: {
  dialog?: boolean;
  onBack?: () => void;
  onNavigate?: () => void;
  onAuthenticated?: () => void;
}) {
  const router = useRouter();
  const { setUser } = useAuthContext();
  const id = useId();
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailError = email.length > 0 && !emailValid;
  const short = registering && password.length > 0 && password.length < 10;
  const mismatch = registering && repeat.length > 0 && password !== repeat;
  const valid = emailValid && password.length > 0 && (!registering || (password.length >= 10 && repeat === password));

  function switchMode() {
    setRegistering(value => !value);
    setPassword(''); setRepeat(''); setMessage(''); setVisible(false);
  }
  function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const next = Array.from(crypto.getRandomValues(new Uint32Array(15)), value => chars[value % chars.length]).join('');
    setPassword(next); setRepeat(next);
  }
  async function resend() {
    if (busy || !emailValid) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/auth/resend-confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await response.json();
      setMessageError(!response.ok);
      setMessage(response.ok ? 'Если адрес зарегистрирован и ещё не подтверждён, мы отправили письмо. Проверьте также папку «Спам».' : data.error || 'Не удалось отправить письмо');
    } catch { setMessageError(true); setMessage('Сервис отправки временно недоступен'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !valid) return;
    setBusy(true); setMessage('');
    try {
      if (registering) {
        const response = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Ошибка регистрации');
        setMessageError(false);
        setMessage('Письмо для подтверждения отправлено. Откройте ссылку в письме, затем войдите в аккаунт.');
        setPassword(''); setRepeat(''); setRegistered(true);
      } else {
        const user = await loginUser(email, password);
        setUser(user);
        if (onAuthenticated) onAuthenticated();
        else { router.replace('/account'); router.refresh(); }
      }
    } catch (error) {
      setMessageError(true);
      setMessage(error instanceof Error ? error.message : 'Сервис временно недоступен');
    } finally { setBusy(false); }
  }

  const view = registered ? 'confirmation' : registering ? 'register' : 'email';
  const title = registered ? 'Подтвердите почту' : registering ? 'Регистрация' : 'Вход по Email';
  return <AuthPanel key={view} title={title} dialog={dialog} onClose={onBack} closeLabel="Вернуться к способам входа">
    {registered ? <AuthStack>
      <AuthNotice key="message" kind={messageError ? 'error' : 'success'}>{message}</AuthNotice>
      <button key="resend" type="button" className="auth-button" disabled={busy} onClick={resend}>{busy ? 'Отправка…' : 'Отправить письмо повторно'}</button>
      <button key="login" type="button" className="auth-button auth-button--primary" onClick={() => { setRegistered(false); setRegistering(false); setMessage(''); }}>Перейти ко входу</button>
    </AuthStack> : <form onSubmit={submit} aria-label={title}>
      <AuthStack>
        <div key="email">
          <FormField label="Email" type="email" placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required maxLength={254} disabled={busy} aria-invalid={emailError || undefined} aria-describedby={emailError ? id + '-email-error' : undefined} />
          {emailError && <p id={id + '-email-error'} className="auth-field-error">Некорректный email</p>}
        </div>
        <div key="password">
          <FormField label="Пароль" type={visible ? 'text' : 'password'} placeholder={registering ? 'Не менее 10 символов' : 'Ваш пароль'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} required maxLength={256} minLength={registering ? 10 : undefined} disabled={busy} adornment={<>
            {registering && <button type="button" disabled={busy} onClick={generatePassword} aria-label="Сгенерировать пароль" title="Сгенерировать пароль"><FaWandMagicSparkles size={12} /></button>}
            <button type="button" disabled={busy} onClick={() => setVisible(value => !value)} aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={visible} title={visible ? 'Скрыть пароль' : 'Показать пароль'}>{visible ? <FaEyeSlash size={12} /> : <FaEye size={12} />}</button>
          </>} />
          {short && <p className="auth-field-error">Пароль должен содержать минимум 10 символов</p>}
        </div>
        {registering && <div key="repeat">
          <FormField label="Подтверждение пароля" type={visible ? 'text' : 'password'} placeholder="Повторите пароль" value={repeat} onChange={event => setRepeat(event.target.value)} autoComplete="new-password" required maxLength={256} disabled={busy} aria-invalid={mismatch || undefined} />
          {mismatch && <p className="auth-field-error">Пароли не совпадают</p>}
        </div>}
        {message && <AuthNotice key="message" kind={messageError ? 'error' : 'success'}>{message}</AuthNotice>}
        <button key="submit" type="submit" disabled={!valid || busy} className="auth-button auth-button--primary">{busy ? 'Подождите…' : registering ? 'Зарегистрироваться' : 'Войти'}</button>
        {!registering && <Link key="forgot" href="/auth/forgot-password" onClick={onNavigate} className="auth-link">Забыли пароль?</Link>}
        <button key="switch" type="button" disabled={busy} onClick={switchMode} className="auth-link">{registering ? 'Уже есть аккаунт?' : 'Создать аккаунт'}</button>
        <button key="resend" type="button" className="auth-link" disabled={busy || !emailValid} onClick={resend}>Отправить подтверждение повторно</button>
      </AuthStack>
    </form>}
  </AuthPanel>;
}
