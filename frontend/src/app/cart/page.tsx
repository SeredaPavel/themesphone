import CartContent from './CartContent';
export const dynamic='force-dynamic';
export default function CartPage(){return <CartContent ordersEnabled={process.env.ORDERS_ENABLED==='true'}/>;}
