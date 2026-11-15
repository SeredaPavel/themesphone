import type {CartPurchase,ShopOrder} from './checkout';

export function quickBuyStorageKey(userId:number,documentId:string){
  if(!Number.isSafeInteger(userId)||userId<=0||!/^[a-z0-9]{24}$/.test(documentId))throw Error('Некорректный товар.');
  return 'themesphone:buy:'+userId+':'+documentId;
}
export function readQuickBuyKey(value:string|null,newKey:()=>string){
  return value&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)?value:newKey();
}
export async function prepareQuickBuy(documentId:string,checkoutKey:string,signal:AbortSignal):Promise<{order:ShopOrder|null;purchase:CartPurchase|null}>{
  const lookup=()=>fetch('/api/account/orders?'+new URLSearchParams({items:documentId,checkoutKey}),{cache:'no-store',signal});
  const read=async(response:Response)=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось подготовить оплату.');return data;};
  const previous=await read(await lookup());
  if(previous.purchases?.length)return {order:null,purchase:previous.purchases[0]};
  const response=await fetch('/api/checkout/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[documentId],checkoutKey}),cache:'no-store',signal});
  // Another checkout can finish while this window is opening.
  if(response.status===409){const updated=await read(await lookup());if(updated.purchases?.length)return {order:null,purchase:updated.purchases[0]};}
  const data=await read(response);
  if(data.order?.items?.length!==1||data.order.items[0].documentId!==documentId)throw Error('Не удалось проверить состав заказа.');
  return {order:data.order,purchase:null};
}
export async function payQuickBuy(orderId:string,signal:AbortSignal){
  const response=await fetch('/api/checkout/'+orderId+'/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось начать оплату.');
  const href=data.payment?.confirmationUrl;
  if(href){const url=new URL(href);if(url.origin!=='https://yoomoney.ru'||url.username||url.password||url.hash||!/^\/(api-pages\/v2\/payment-confirm\/epl|checkout\/payments\/v2\/contract|payments\/external\/confirmation)$/.test(url.pathname))throw Error('Не удалось проверить адрес оплаты.');}
  return {order:data.order as ShopOrder,href:href as string|null};
}
