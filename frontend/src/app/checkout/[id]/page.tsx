import CheckoutContent from './CheckoutContent';
export const dynamic='force-dynamic';
export default function CheckoutPage(){return <CheckoutContent paymentsEnabled={process.env.PAYMENTS_ENABLED==='true'}/>;}
