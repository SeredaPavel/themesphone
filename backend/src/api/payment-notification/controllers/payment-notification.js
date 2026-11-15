'use strict';
const {createPayments}=require('../../../lib/shop-payments');
const {PaymentError}=require('../../../lib/yookassa');
const {timingSafeEqual}=require('node:crypto');
function bridge(value){
  const expected=process.env.PAYMENT_WEBHOOK_BRIDGE_SECRET;
  return typeof expected==='string'&&expected.length>=43&&typeof value==='string'&&Buffer.byteLength(expected)===Buffer.byteLength(value)&&timingSafeEqual(Buffer.from(expected),Buffer.from(value));
}
module.exports=({strapi})=>({
  async notify(ctx){
    ctx.set('Cache-Control','no-store');
    if(!bridge(ctx.get('x-payment-bridge'))){ctx.status=403;ctx.body={error:'forbidden'};return;}
    try{ctx.body=await createPayments(strapi).webhook(ctx.request.body);}
    catch(error){ctx.status=error instanceof PaymentError?error.status:503;ctx.body={error:'notification_not_processed'};}
  },
});
