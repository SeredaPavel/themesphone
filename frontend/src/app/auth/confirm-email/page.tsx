'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthPanel, { AuthNotice, AuthScreen, AuthStack } from '@/components/auth/AuthSurface';

function ConfirmEmailContent() {
  const params=useSearchParams();
  const fromAccount=params.get('account')==='1';
  const request=useRef<Promise<Response>|null>(null);
  const [status,setStatus]=useState<'loading'|'success'|'error'>('loading');
  useEffect(()=>{
    const confirmation=params.get('confirmation');
    if(!confirmation){setStatus('error');return;}
    request.current ||= fetch('/api/auth/email-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation})});
    request.current.then(response=>setStatus(response.ok?'success':'error')).catch(()=>setStatus('error'));
  },[params]);
  return <AuthPanel title={status==='success'?'Почта подтверждена':'Подтверждение почты'}>
    <AuthStack>
      {status==='loading' && <p key="loading" role="status" className="auth-copy">Подтверждаем ваш email…</p>}
      {status==='success' && <AuthNotice key="success" kind="success">{fromAccount?'Email подтверждён.':'Email подтверждён. Теперь можно войти в аккаунт.'}</AuthNotice>}
      {status==='error' && <AuthNotice key="error" kind="error">Ссылка недействительна, уже использована или сервис временно недоступен. {fromAccount?'Новую ссылку можно запросить в кабинете.':'Письмо можно отправить повторно в форме входа.'}</AuthNotice>}
      {status!=='loading' && <Link key="back" href={fromAccount?'/account':'/?auth=popup'} className="auth-button auth-button--primary">{fromAccount?'Перейти в личный кабинет':'Вернуться ко входу'}</Link>}
    </AuthStack>
  </AuthPanel>;
}
export default function ConfirmEmailPage() {
  return <AuthScreen><Suspense fallback={<AuthPanel title="Подтверждение почты"><AuthStack><p role="status" className="auth-copy">Подтверждаем ваш email…</p></AuthStack></AuthPanel>}><ConfirmEmailContent/></Suspense></AuthScreen>;
}
