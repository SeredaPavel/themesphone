import type {CartItem} from './cart-storage';
import type {CartPurchase} from './checkout';

export function cartCheckout(items:CartItem[],purchases:Record<string,CartPurchase>){
  const unpaid=items.filter(item=>!item.documentId||!purchases[item.documentId]);
  return {unpaid,total:unpaid.reduce((sum,item)=>sum+item.price,0)};
}
