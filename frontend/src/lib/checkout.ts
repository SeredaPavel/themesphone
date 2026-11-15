// Browser input contains product IDs only. Strapi resolves the amount and owner.
export type ShopOrder = {
  id:string; currency:'RUB'; totalKopecks:number;
  state:'awaiting_payment'|'cancelled'|'expired'|'paid'; createdAt:string; expiresAt:string;
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
    !['awaiting_payment','cancelled','expired','paid'].includes(value.state) || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.expiresAt)) ||
    !Array.isArray(value.items) || !value.items.length || value.items.length>30)throw Error('Invalid order');
  const items=value.items.map((item:any)=>{
    if(!item || !documentId.test(item.documentId) || typeof item.title!=='string' || item.title.length>300 || item.quantity!==1 || !Number.isSafeInteger(item.unitKopecks) || item.unitKopecks<=0)throw Error('Invalid item');
    return {documentId:item.documentId,title:item.title,quantity:1 as const,unitKopecks:item.unitKopecks};
  });
  if(items.reduce((sum:number,item:ShopOrder['items'][number])=>sum+item.unitKopecks,0)!==value.totalKopecks)throw Error('Invalid total');
  return {id:value.id,currency:'RUB',totalKopecks:value.totalKopecks,state:value.state,createdAt:value.createdAt,expiresAt:value.expiresAt,items};
}
async function cms(req:Request,route:string,method='GET',data?:unknown) {
  const token=session(req);
  if(!token)return json({error:messages.login_required},401);
  try {
    if(!process.env.STRAPI_API_URL)throw Error('Missing CMS');
    const response=await fetch(process.env.STRAPI_API_URL.replace(/\/$/,'')+'/api/'+route,{
      method,headers:{Authorization:'Bearer '+token,...(data!==undefined?{'Content-Type':'application/json'}:{})},
      ...(data!==undefined?{body:JSON.stringify(data)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
    });
    const value=await response.json();
    if(!response.ok) {
      const status=[400,401,403,404,409,429].includes(response.status)?response.status:503;
      const code=status===401?'login_required':status===404?'order_not_found':value?.error;
      return json({error:messages[code]||messages.orders_unavailable},status);
    }
    return json({order:safeOrder(value)});
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
