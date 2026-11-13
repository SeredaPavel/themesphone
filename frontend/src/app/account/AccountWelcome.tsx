'use client';
import {useState} from 'react';
import Link from 'next/link';

const names:Record<string,string>={google:'Google',yandex:'Яндекс',telegram:'Telegram'};
export default function AccountWelcome({provider,merged,withoutEmail}:{provider?:string;merged:boolean;withoutEmail:boolean}) {
  const [dismissed,setDismissed]=useState(false);
  const name=provider?names[provider]:undefined;
  if(dismissed || (!merged && (!name || !withoutEmail)))return null;
  return <section className="glass-panel p-5 lg:col-span-2 relative space-y-3 pr-12" aria-label={merged?'Аккаунты объединены':'Дополнительный способ входа'}>
    <button type="button" className="absolute top-3 right-3 liquid-pill !p-2" aria-label="Закрыть подсказку" onClick={()=>setDismissed(true)}>✕</button>
    <p role="status">{merged?'Аккаунты объединены. Покупки и подключённые способы входа теперь доступны в одном кабинете.':`Вы вошли через ${name}. Если захотите входить также по email, добавьте почту и создайте пароль в этом кабинете — повторная регистрация не нужна.`}</p>
    {withoutEmail && <Link href="#account-password" className="liquid-pill">Добавить почту и создать пароль</Link>}
  </section>;
}
