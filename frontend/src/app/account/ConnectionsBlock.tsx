'use client';
import {useEffect,useState} from 'react';
import PasswordBlock from './PasswordBlock';
type Connection={provider:string;enabled:boolean;linked:boolean};
const names:Record<string,string>={google:'Google',yandex:'Яндекс',telegram:'Telegram'};
export default function ConnectionsBlock({email}:{email:string|null}) {
  const [connections,setConnections]=useState<Connection[]>([]);
  const [hasPassword,setHasPassword]=useState<boolean|null>(null);
  const [accountEmail,setAccountEmail]=useState(email);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function load() {
    const res=await fetch('/api/account/connections',{cache:'no-store'});
    if(!res.ok) throw Error('Способы входа временно недоступны');
    const data=await res.json();setConnections(data.connections);setHasPassword(data.hasPassword);setAccountEmail(data.email ?? null);
  }
  useEffect(()=>{load().catch(error=>setError(error.message));},[]);
  async function unlink(provider:string) {
    setBusy(true);setError('');
    try {
      const res=await fetch('/api/account/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider})});
      const data=await res.json();if(!res.ok) throw Error(data.error);
      await load();
    } catch(error){setError(error instanceof Error?error.message:'Не удалось отключить сервис');}
    finally{setBusy(false);}
  }
  if(hasPassword===null) return <section className="form-panel flex flex-col gap-4" aria-busy={!error}>
    <h2>Способы входа</h2>
    {error?<><p role="alert" className="form-message form-message--error">{error}</p><button type="button" className="liquid-pill self-start" onClick={()=>{setError('');load().catch(error=>setError(error.message));}}>Повторить</button></>:<p role="status" className="form-muted text-sm">Загружаем способы входа…</p>}
  </section>;
  return <>
  <PasswordBlock email={accountEmail} hasPassword={hasPassword} providers={connections.filter(item=>item.linked).map(item=>names[item.provider] || item.provider)} />
  <section className="form-panel flex flex-col gap-4">
    <h2>Способы входа</h2>
    <p className="form-muted text-sm">Подключите сервис к этому аккаунту, чтобы входить без пароля.</p>
    {connections.map(item=><div key={item.provider} className="flex items-center justify-between gap-3 flex-wrap">
      <span>{names[item.provider]}{item.linked?' · подключён':''}</span>
      {item.linked?<button type="button" className="liquid-pill" disabled={busy || (!hasPassword && connections.filter(item=>item.linked).length<=1)} onClick={()=>unlink(item.provider)}>Отключить</button>:<form method="post" action={'/api/connect/'+item.provider}><input type="hidden" name="mode" value="link"/><button disabled={busy || !item.enabled} className="liquid-pill" type="submit">Подключить</button></form>}
    </div>)}
    {!hasPassword && <p className="form-muted text-sm">Последний способ входа можно отключить после создания пароля или подключения другого сервиса.</p>}
    {error && <p role="alert" className="form-message form-message--error">{error}</p>}
  </section>
  </>;
}
