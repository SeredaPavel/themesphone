export type CartItem={id:number; documentId?:string; title:string; imageUrl:string; price:number};
export type StoredCart={version:2; items:CartItem[]; checkoutKey:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function normalizeCart(value:unknown):CartItem[] {
  if(!Array.isArray(value))return [];
  const result:CartItem[]=[];
  for(const item of value.slice(0,100)) {
    if(!item || typeof item!=='object' || !Number.isSafeInteger(item.id) || item.id<=0 ||
      typeof item.title!=='string' || !item.title.trim() || item.title.length>300 ||
      typeof item.imageUrl!=='string' || item.imageUrl.length>2048 || !/^(https?:\/\/|\/[^/])/.test(item.imageUrl) ||
      typeof item.price!=='number' || !Number.isFinite(item.price) || item.price<=0 || item.price>1000000 ||
      (item.documentId!==undefined && (typeof item.documentId!=='string' || !/^[a-z0-9]{24}$/.test(item.documentId))))continue;
    if(result.some(row=>row.id===item.id || (item.documentId && row.documentId===item.documentId)))continue;
    result.push({id:item.id,...(item.documentId?{documentId:item.documentId}:{}),title:item.title,imageUrl:item.imageUrl,price:item.price});
    if(result.length===30)break;
  }
  return result;
}
export function readCart(text:string|null,newKey:()=>string):StoredCart {
  let value;
  try {value=text && text.length<=150000?JSON.parse(text):null;}catch{value=null;}
  return {version:2,items:normalizeCart(Array.isArray(value)?value:value?.version===2?value.items:null),
    checkoutKey:value?.version===2 && typeof value.checkoutKey==='string' && uuid.test(value.checkoutKey)?value.checkoutKey:newKey()};
}
