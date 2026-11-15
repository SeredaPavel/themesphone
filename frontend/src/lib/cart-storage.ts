export type CartItem={id:number; documentId?:string; title:string; imageUrl:string; price:number};
export type StoredCart={version:2; items:CartItem[]; checkoutKey:string; completedOrders?:string[];pendingOrders?:{id:string;userId:number}[]};
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
  const completedOrders=Array.isArray(value?.completedOrders)?Array.from(new Set<string>(value.completedOrders.filter((id:unknown):id is string=>typeof id==='string'&&uuid.test(id)))).slice(-200):[];
  const pendingOrders:NonNullable<StoredCart['pendingOrders']>=[];
  if(Array.isArray(value?.pendingOrders))for(const row of value.pendingOrders.slice(-20)){
    if(row&&typeof row.id==='string'&&uuid.test(row.id)&&Number.isSafeInteger(row.userId)&&row.userId>0&&!completedOrders.includes(row.id)&&!pendingOrders.some(p=>p.id===row.id))pendingOrders.push({id:row.id,userId:row.userId});
  }
  return {version:2,items:normalizeCart(Array.isArray(value)?value:value?.version===2?value.items:null),
    ...(completedOrders.length?{completedOrders}:{}),
    ...(pendingOrders.length?{pendingOrders}:{}),
    checkoutKey:value?.version===2 && typeof value.checkoutKey==='string' && uuid.test(value.checkoutKey)?value.checkoutKey:newKey()};
}

export function completeCartOrder(cart:StoredCart,order:{id:string;state:string;items:{documentId:string}[]},newKey:()=>string):StoredCart {
  if(!['paid','test_paid'].includes(order.state)||!uuid.test(order.id)||!Array.isArray(order.items)||!order.items.length||order.items.length>30||
    order.items.some(item=>typeof item.documentId!=='string'||!/^[a-z0-9]{24}$/.test(item.documentId)))return cart;
  cart=forgetCartOrder(cart,order.id);
  if(cart.completedOrders?.includes(order.id))return cart;
  const purchased=new Set(order.items.map(item=>item.documentId));
  const items=cart.items.filter(item=>!item.documentId||!purchased.has(item.documentId));
  return {...cart,items,checkoutKey:items.length===cart.items.length?cart.checkoutKey:newKey(),completedOrders:[...(cart.completedOrders||[]),order.id].slice(-200)};
}
export function rememberCartOrder(cart:StoredCart,id:string,userId:number):StoredCart {
  if(!uuid.test(id)||!Number.isSafeInteger(userId)||userId<=0||cart.completedOrders?.includes(id)||cart.pendingOrders?.some(row=>row.id===id))return cart;
  return {...cart,pendingOrders:[...(cart.pendingOrders||[]),{id,userId}].slice(-20)};
}
export function forgetCartOrder(cart:StoredCart,id:string):StoredCart {
  if(!cart.pendingOrders?.some(row=>row.id===id))return cart;
  return {...cart,pendingOrders:cart.pendingOrders.filter(row=>row.id!==id)};
}
export function completePendingCartOrder(cart:StoredCart,order:{id:string;state:string;items:{documentId:string}[]},userId:number,newKey:()=>string):StoredCart {
  if(!cart.pendingOrders?.some(row=>row.id===order.id&&row.userId===userId))return cart;
  return completeCartOrder(cart,order,newKey);
}
