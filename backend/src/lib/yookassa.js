'use strict';
const {Agent,fetch}=require('undici');
const PAYMENT_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
class PaymentError extends Error{
  constructor(code,status=503){super(code);this.code=code;this.status=status;}
}
function configuration(env=process.env){
  if(env.PAYMENTS_ENABLED!=='true'||env.PAYMENT_PROVIDER!=='yookassa'||env.YOOKASSA_MODE!=='test')throw new PaymentError('payments_unavailable');
  if(!/^\d{1,20}$/.test(env.YOOKASSA_SHOP_ID||'')||!/^test_\S+$/.test(env.YOOKASSA_SECRET_KEY||''))throw new PaymentError('payments_unavailable');
  let origin;
  try{
    const url=new URL(env.PAYMENT_RETURN_ORIGIN);
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||
      (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw Error();
    origin=url.origin;
  }catch{throw new PaymentError('payments_unavailable');}
  return {shopId:env.YOOKASSA_SHOP_ID,secret:env.YOOKASSA_SECRET_KEY,origin,mode:'test'};
}
function confirmationUrl(value){
  try{
    if(typeof value!=='string'||value.length>4096)throw Error();
    const url=new URL(value);
    if(url.origin!=='https://yoomoney.ru'||url.username||url.password||url.hash||
      !/^\/(api-pages\/v2\/payment-confirm\/epl|checkout\/payments\/v2\/contract|payments\/external\/confirmation)$/.test(url.pathname))throw Error();
    return url.href;
  }catch{throw new PaymentError('payment_response_invalid');}
}
function amount(kopecks){
  if(!Number.isSafeInteger(kopecks)||kopecks<=0||kopecks>1000000000)throw new PaymentError('payment_response_invalid');
  return Math.floor(kopecks/100)+'.'+String(kopecks%100).padStart(2,'0');
}
function validatePayment(value,expected){
  if(!value||typeof value.id!=='string'||!PAYMENT_ID.test(value.id)||
    (expected.paymentId&&value.id!==expected.paymentId)||value.test!==true||
    value.recipient?.account_id!==expected.shopId||value.amount?.currency!=='RUB'||value.amount?.value!==amount(expected.totalKopecks)||
    value.metadata?.order_id!==expected.orderId||value.metadata?.attempt_id!==expected.attemptId||
    !['pending','waiting_for_capture','succeeded','canceled'].includes(value.status)||typeof value.paid!=='boolean'||
    (value.status==='succeeded'&&value.paid!==true))throw new PaymentError('payment_response_invalid');
  return {id:value.id,state:value.status,confirmationUrl:value.status==='pending'?confirmationUrl(value.confirmation?.confirmation_url):null};
}
function createYooKassa(config,request=fetch){
  const dispatcher=new Agent({connect:{family:4,timeout:10000}});
  async function api(route,method='GET',body,key){
    try{
      const response=await request('https://api.yookassa.ru/v3/'+route,{
        method,dispatcher,redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{Authorization:'Basic '+Buffer.from(config.shopId+':'+config.secret).toString('base64'),
          ...(body?{'Content-Type':'application/json','Idempotence-Key':key}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),
      });
      if(!response.ok)throw new PaymentError(response.status===429?'payment_busy':'payment_provider_unavailable',response.status===429?429:503);
      return await response.json();
    }catch(error){if(error instanceof PaymentError)throw error;throw new PaymentError('payment_provider_unavailable');}
  }
  return {
    async checkShop(){const data=await api('me');if(data.test!==true||String(data.account_id)!==config.shopId||data.status!=='enabled')throw new PaymentError('payments_unavailable');},
    create: (body,key)=>api('payments','POST',body,key),
    get(id){if(!PAYMENT_ID.test(id))throw new PaymentError('payment_response_invalid');return api('payments/'+id);},
    close:()=>dispatcher.close(),
  };
}
module.exports={PaymentError,PAYMENT_ID,configuration,confirmationUrl,amount,validatePayment,createYooKassa};
