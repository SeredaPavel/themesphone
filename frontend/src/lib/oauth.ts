import { sessionCookie } from './email-auth.ts';
import {oauthMessages} from './oauth-messages.ts';
const providers = ['google','yandex','telegram'];
const capability = (value: unknown): value is string => typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
function json(body:unknown,status=200) {return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
function originAllowed(value:string) {
  const allowed=[process.env.FRONTEND_URL,...(process.env.AUTH_ALLOWED_ORIGINS || '').split(',')];
  return allowed.some(item=>item?.trim()===value) && /^https?:\/\//.test(value);
}
function requestOrigin(req:Request) {
  const origin=req.headers.get('origin');
  if(!origin || !originAllowed(origin)) throw Error('origin');
  return origin;
}
function publicOrigin(req:Request) {
  const direct=new URL(req.url).origin;
  if(originAllowed(direct)) return direct;
  // Caddy supplies Host for HTTPS; only explicitly registered origins are accepted.
  const host=req.headers.get('x-forwarded-host') || req.headers.get('host');
  const external='https://'+host;
  if(host && originAllowed(external)) return external;
  throw Error('origin');
}
function cookie(req:Request,name:string) {
  try {return decodeURIComponent(req.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1) || '');} catch {return '';}
}
function temporaryCookie(name:string,value:string,origin:string,maxAge=600) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith('https:')?'; Secure':''}`;
}
function redirect(path:string,origin:string,cookies:string[]=[]) {
  const headers=new Headers({'Location':new URL(path,origin).href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  for(const value of cookies) headers.append('Set-Cookie',value);
  return new Response(null,{status:303,headers});
}
async function bridge(req:Request,origin:string,action:string,extra:Record<string,unknown>={}) {
  if(process.env.OAUTH_ENABLED!=='true' || !process.env.STRAPI_API_URL || !/^[a-f0-9]{64}$/.test(process.env.OAUTH_BRIDGE_SECRET || '')) throw Error('unavailable');
  const res=await fetch(process.env.STRAPI_API_URL.replace(/\/$/,'')+'/api/oauth/bridge',{
    method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{'Content-Type':'application/json','x-oauth-bridge':process.env.OAUTH_BRIDGE_SECRET!},
    body:JSON.stringify({...extra,action,origin,token:cookie(req,'token'),clientIp:req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'local'}),
  });
  const data=await res.json();
  return {data,status:res.status,ok:res.ok};
}
async function input(req:Request) {
  const text=await req.text();if(text.length>16384) throw Error('body');
  const result=JSON.parse(text);if(!result || typeof result!=='object' || Array.isArray(result)) throw Error('body');return result;
}
export async function oauthStart(req:Request,provider:string) {
  let origin;
  try {origin=requestOrigin(req);} catch {return json({error:'Недопустимый источник запроса'},403);}
  if(!providers.includes(provider)) return json({error:'Сервис недоступен'},404);
  try {
    const text=await req.text();if(text.length>16384) throw Error('body');
    const form=new URLSearchParams(text);
    const mode=['link','merge-verify'].includes(form.get('mode') || '')?form.get('mode'):'login';
    const {data,ok}=await bridge(req,origin,'start',{provider,mode,merge:cookie(req,'oauth_merge')});
    if(!ok) return redirect((mode==='merge-verify'?'/auth/merge':'/auth/social')+'?error='+encodeURIComponent(data.error || 'service_unavailable'),origin);
    const url=new URL(data.url);
    const expected:Record<string,string>={google:'https://accounts.google.com',yandex:'https://oauth.yandex.ru',telegram:'https://oauth.telegram.org'};
    if(url.origin!==expected[provider] || !capability(data.browser)) throw Error('response');
    return redirect(url.href,origin,[temporaryCookie('oauth_'+provider,data.browser,origin)]);
  } catch {return redirect('/auth/social?error=service_unavailable',origin);}
}
export async function oauthCallback(req:Request,provider:string) {
  const url=new URL(req.url);
  if(!providers.includes(provider)) return json({error:'Сервис недоступен'},404);
  let origin;
  try {origin=publicOrigin(req);} catch {return json({error:'Некорректный адрес возврата'},400);}
  const clear=temporaryCookie('oauth_'+provider,'',origin,0);
  const fail=(error:string)=>redirect((cookie(req,'oauth_merge')?'/auth/merge':'/auth/social')+'?error='+encodeURIComponent(error),origin,[clear]);
  if(url.searchParams.getAll('state').length!==1 || url.searchParams.getAll('code').length>1 || url.searchParams.getAll('error').length>1 || url.searchParams.has('access_token') || (url.searchParams.has('code') && url.searchParams.has('error'))) return fail('invalid_flow');
  const state=url.searchParams.get('state');const browser=cookie(req,'oauth_'+provider);
  if(!capability(state) || !capability(browser)) return fail('invalid_flow');
  try {
    const {data,ok}=await bridge(req,origin,'finish',{provider,state,browser,merge:cookie(req,'oauth_merge'),code:url.searchParams.get('code'),error:url.searchParams.get('error')});
    if(!ok) return fail(data.error || 'service_unavailable');
    if(typeof data.jwt==='string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.jwt)) return redirect('/account'+(data.linked?'?connected='+provider:data.created?'?welcome='+provider:''),origin,[clear,temporaryCookie('oauth_pending','',origin,0),temporaryCookie('oauth_merge','',origin,0),sessionCookie(data.jwt)]);
    if(capability(data.mergePending)) return redirect('/auth/merge',origin,[clear,temporaryCookie('oauth_merge',data.mergePending,origin,600)]);
    if(data.mergeVerified===true) return redirect('/auth/merge',origin,[clear]);
    if(capability(data.pending)) return redirect('/auth/social',origin,[clear,temporaryCookie('oauth_pending',data.pending,origin,900)]);
    throw Error('response');
  } catch {return fail('service_unavailable');}
}
export async function oauthProviders(req:Request) {
  if(process.env.OAUTH_ENABLED!=='true') return json({providers:providers.map(provider=>({provider,enabled:false}))});
  try {
    const origin=process.env.FRONTEND_URL!;
    const {data,ok}=await bridge(req,origin,'providers');
    if(!ok) throw Error('response');
    return json(data);
  } catch {return json({providers:providers.map(provider=>({provider,enabled:false}))});}
}
export async function oauthAction(req:Request,action:'pending'|'register'|'connections'|'unlink'|'account') {
  let origin;
  try {
    origin=req.method==='GET'?publicOrigin(req):requestOrigin(req);
    if(!originAllowed(origin)) throw Error('origin');
  } catch {return json({error:'Недопустимый источник запроса'},403);}
  try {
    const fields=req.method==='GET'?{}:await input(req);
    let serverAction:string=action;
    if(action==='connections' && new URL(req.url).searchParams.get('view')==='merge') serverAction='mergePreview';
    if(action==='account') {
      if(fields.action==='add-email') serverAction='requestEmail';
      else if(fields.action==='create-password') serverAction='requestPassword';
      else if(fields.action==='merge-accounts') serverAction='mergeConfirm';
      else if(fields.action==='cancel-merge') serverAction='mergeCancel';
      else if(fields.action===undefined) serverAction='unlink';
      else return json({error:'Некорректное действие'},400);
    }
    const {data,status,ok}=await bridge(req,origin,serverAction,{pending:cookie(req,'oauth_pending'),merge:cookie(req,'oauth_merge'),email:fields.email,provider:fields.provider,...(serverAction==='mergeConfirm'?{confirm:fields.confirm,password:fields.password}:{})});
    if(!ok) {
      const response=json({error:oauthMessages[data.error] || 'Сервис временно недоступен',code:data.error},status);
      if(serverAction.startsWith('merge') && ['invalid_merge','merge_changed','login_required'].includes(data.error)) response.headers.append('Set-Cookie',temporaryCookie('oauth_merge','',origin,0));
      return response;
    }
    const response=serverAction==='mergeConfirm'?json({merged:true}):json(data);
    if(serverAction==='mergeConfirm') {
      if(typeof data.jwt!=='string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.jwt)) return json({error:'Сервис временно недоступен'},503);
      response.headers.append('Set-Cookie',sessionCookie(data.jwt));
    }
    if(serverAction==='mergeConfirm' || serverAction==='mergeCancel') response.headers.append('Set-Cookie',temporaryCookie('oauth_merge','',origin,0));
    if(action==='register') response.headers.append('Set-Cookie',temporaryCookie('oauth_pending','',origin,0));
    return response;
  } catch {return json({error:'Сервис временно недоступен'},503);}
}
