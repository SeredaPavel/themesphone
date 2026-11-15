// Browser input contains product IDs only. Strapi resolves the amount and owner.
export type ShopOrder = {
  id:string; currency:'RUB'; totalKopecks:number;
  state:'awaiting_payment'|'cancelled'|'expired'|'test_paid'|'paid'; createdAt:string; expiresAt:string;
  items:{documentId:string; title:string; unitKopecks:number; quantity:1}[];
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const documentId=/^[a-z0-9]{24}$/;
const messages:Record<string,string>={
  login_required:'Войдите в аккаунт, чтобы оформить заказ.',
  invalid_order:'Обновите корзину и попробуйте ещё раз.', invalid_page:'Некорректная страница заказов.',
  checkout_conflict:'Состав корзины изменился. Оформите новый заказ.',
  product_unavailable:'Один из товаров пока недоступен для покупки. Вернитесь в корзину.',
  invalid_price:'Цена товара обновляется. Попробуйте позже.',
  order_not_found:'Заказ не найден.', order_not_cancellable:'Этот заказ уже нельзя отменить.',
  too_many_orders:'У вас много незавершённых заказов. Отмените ненужные или попробуйте позже.',
  orders_unavailable:'Оформление заказов временно недоступно.',
  payments_unavailable:'Оплата временно недоступна.',payment_provider_unavailable:'Не удалось связаться с ЮKassa. Повторите попытку — повторный платёж не создастся.',
  payment_response_invalid:'Не удалось подтвердить ответ ЮKassa. Попробуйте проверить оплату ещё раз.',
  payment_busy:'ЮKassa обрабатывает запрос. Повторите немного позже.',order_not_payable:'Заказ уже закрыт или срок оформления истёк.',
  payment_review_required:'Статус платежа требует проверки. Новый платёж по этому заказу не создаётся.',
  payment_in_progress:'Оплата уже начата. Отмена доступна на странице ЮKassa.',
};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function sameOrigin(req:Request) {
  const origin=req.headers.get('origin');
  const allowed=[new URL(req.url).origin,process.env.FRONTEND_URL,...(process.env.AUTH_ALLOWED_ORIGINS||'').split(',')];
  return !!origin && allowed.some(value=>{try{return origin===new URL(value!.trim()).origin;}catch{return false;}});
}
function session(req:Request) {
  try {
    const token=decodeURIComponent(req.headers.get('cookie')?.match(/(?:^|;\s*)token=([^;]+)/)?.[1]||'');
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)?token:null;
  }catch{return null;}
}
function safeOrder(value:any):ShopOrder {
  if(!value || typeof value.id!=='string' || !uuid.test(value.id) || value.currency!=='RUB' || !Number.isSafeInteger(value.totalKopecks) || value.totalKopecks<=0 ||
    !['awaiting_payment','cancelled','expired','test_paid','paid'].includes(value.state) || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.expiresAt)) ||
    !Array.isArray(value.items) || !value.items.length || value.items.length>30)throw Error('Invalid order');
  const items=value.items.map((item:any)=>{
    if(!item || !documentId.test(item.documentId) || typeof item.title!=='string' || item.title.length>300 || item.quantity!==1 || !Number.isSafeInteger(item.unitKopecks) || item.unitKopecks<=0)throw Error('Invalid item');
    return {documentId:item.documentId,title:item.title,quantity:1 as const,unitKopecks:item.unitKopecks};
  });
  if(items.reduce((sum:number,item:ShopOrder['items'][number])=>sum+item.unitKopecks,0)!==value.totalKopecks)throw Error('Invalid total');
  return {id:value.id,currency:'RUB',totalKopecks:value.totalKopecks,state:value.state,createdAt:value.createdAt,expiresAt:value.expiresAt,items};
}
function safePayment(value:any){
  if(value===null)return null;
  if(!value||value.test!==true||!['creating','pending','waiting_for_capture','succeeded','canceled'].includes(value.state))throw Error('Invalid payment');
  let confirmationUrl:string|null=null;
  if(value.confirmationUrl!==null){
    if(typeof value.confirmationUrl!=='string'||value.confirmationUrl.length>4096)throw Error('Invalid redirect');
    const url=new URL(value.confirmationUrl);
    if(url.origin!=='https://yoomoney.ru'||url.username||url.password||url.hash||!/^\/(api-pages\/v2\/payment-confirm\/epl|checkout\/payments\/v2\/contract|payments\/external\/confirmation)$/.test(url.pathname))throw Error('Invalid redirect');
    confirmationUrl=url.href;
  }
  return {state:value.state as string,test:true as const,confirmationUrl};
}
async function cms(req:Request,route:string,method='GET',data?:unknown,payment=false) {
  const token=session(req);
  if(!token)return json({error:messages.login_required},401);
  try {
    if(!process.env.STRAPI_API_URL)throw Error('Missing CMS');
    const response=await fetch(process.env.STRAPI_API_URL.replace(/\/$/,'')+'/api/'+route,{
      method,headers:{Authorization:'Bearer '+token,...(data!==undefined?{'Content-Type':'application/json'}:{}),...(payment&&method==='POST'?{'X-Storefront-Origin':req.headers.get('origin')||''}:{})},
      ...(data!==undefined?{body:JSON.stringify(data)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(payment?45000:10000),
    });
    const value=await response.json();
    if(!response.ok) {
      const status=[400,401,403,404,409,429].includes(response.status)?response.status:503;
      const code=status===401?'login_required':status===404?'order_not_found':value?.error;
      return json({error:messages[code]||messages.orders_unavailable},status);
    }
    return payment?json({order:safeOrder(value.order),payment:safePayment(value.payment)}):json({order:safeOrder(value)});
  }catch{return json({error:messages.orders_unavailable},503);}
}
export async function startCheckout(req:Request) {
  if(!sameOrigin(req))return json({error:'Недопустимый источник запроса'},403);
  if(!session(req))return json({error:messages.login_required},401);
  let data;
  try {
    const text=await req.text();if(text.length>8192)throw Error();data=JSON.parse(text);
    if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).some(key=>!['items','checkoutKey'].includes(key)) ||
      typeof data.checkoutKey!=='string' || !uuid.test(data.checkoutKey) || !Array.isArray(data.items) || !data.items.length || data.items.length>30 ||
      data.items.some((id:unknown)=>typeof id!=='string'||!documentId.test(id)) || new Set(data.items).size!==data.items.length)throw Error();
  }catch{return json({error:messages.invalid_order},400);}
  return cms(req,'shop-orders','POST',{items:data.items,checkoutKey:data.checkoutKey});
}
export async function getCheckout(req:Request,id:string) {
  if(!uuid.test(id))return json({error:messages.order_not_found},404);
  return cms(req,'shop-orders/'+id);
}
export async function cancelCheckout(req:Request,id:string) {
  if(!sameOrigin(req))return json({error:'Недопустимый источник запроса'},403);
  if(!uuid.test(id))return json({error:messages.order_not_found},404);
  return cms(req,'shop-orders/'+id+'/cancel','POST',{});
}
export function paymentUnavailable() {
  return json({error:'Оплата ещё не подключена. Деньги не списаны.'},503);
}
export async function checkoutPayment(req:Request,id:string){
  if(req.method==='POST'&&!sameOrigin(req))return json({error:'Недопустимый источник запроса'},403);
  if(process.env.PAYMENTS_ENABLED!=='true')return paymentUnavailable();
  if(!uuid.test(id))return json({error:messages.order_not_found},404);
  if(req.method==='POST'){
    try{const text=await req.text();if(text.length>128)throw Error();const body=text?JSON.parse(text):{};
      if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)throw Error();
    }catch{return json({error:messages.invalid_order},400);}
  }
  return cms(req,'shop-orders/'+id+'/payment',req.method,req.method==='POST'?{}:undefined,true);
}
export async function paymentNotification(req:Request){
  if(process.env.PAYMENTS_ENABLED!=='true')return json({error:'unavailable'},503);
  const secret=process.env.PAYMENT_WEBHOOK_BRIDGE_SECRET;
  if(!secret||secret.length<43||!process.env.STRAPI_API_URL)return json({error:'unavailable'},503);
  let input;
  try{
    const text=await req.text();if(text.length>32768)throw Error();input=JSON.parse(text);
    if(input?.type!=='notification'||!['payment.succeeded','payment.canceled','payment.waiting_for_capture'].includes(input.event)||
      typeof input.object?.id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.object.id))throw Error();
  }catch{return json({error:'invalid_notification'},400);}
  try{
    const response=await fetch(process.env.STRAPI_API_URL.replace(/\/$/,'')+'/api/payment-notifications/yookassa',{
      method:'POST',headers:{'Content-Type':'application/json','X-Payment-Bridge':secret},body:JSON.stringify({type:input.type,event:input.event,object:{id:input.object.id,metadata:input.object.metadata}}),
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
    });
    if(!response.ok||(await response.json()).accepted!==true)throw Error();
    return json({accepted:true});
  }catch{return json({error:'notification_not_processed'},503);}
}
