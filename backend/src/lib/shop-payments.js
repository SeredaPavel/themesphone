'use strict';
const {randomUUID}=require('node:crypto');
const {ORDER,withOwner,publicOrder,OrderError}=require('./shop-orders');
const {PaymentError,PAYMENT_ID,configuration,amount,validatePayment,createYooKassa}=require('./yookassa');
const PAYMENT='api::shop-payment.shop-payment';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function lockOrder(strapi,trx,reference){
  const meta=strapi.db.metadata.get(ORDER);
  await trx(meta.tableName).where(meta.attributes.reference.columnName,reference).forUpdate().first();
}
function createPayments(strapi,options={}){
  const order=()=>strapi.db.query(ORDER),payments=()=>strapi.db.query(PAYMENT);
  const config=()=>options.config||configuration();
  async function owned(userId,reference,work){
    if(typeof reference!=='string'||!UUID.test(reference))throw new OrderError('order_not_found',404);
    return withOwner(strapi,userId,()=>strapi.db.transaction(async({trx})=>{
      await lockOrder(strapi,trx,reference);
      const row=await order().findOne({where:{reference,owner:{id:userId}}});
      if(!row)throw new OrderError('order_not_found',404);
      return work(row);
    }));
  }
  async function usingApi(cfg,work){
    const api=options.api||createYooKassa(cfg);
    try{return await work(api);}finally{if(!options.api)await api.close();}
  }
  async function save(attempt,raw,cfg){
    return strapi.db.transaction(async({trx})=>{
      // Webhooks lock the order only, never the owner: no deadlock with merges.
      await lockOrder(strapi,trx,attempt.orderReference);
      const row=await order().findOne({where:{reference:attempt.orderReference}});
      const current=await payments().findOne({where:{id:attempt.id}});
      if(!row||!current||current.shopId!==cfg.shopId||current.mode!=='test')throw new PaymentError('payment_response_invalid');
      const verified=validatePayment(raw,{paymentId:current.providerId,shopId:cfg.shopId,totalKopecks:Number(row.totalKopecks),orderId:row.reference,attemptId:current.attemptId});
      if(current.providerId&&current.providerId!==verified.id)throw new PaymentError('payment_response_invalid');
      // Terminal statuses cannot be downgraded by an older concurrent response.
      if(['succeeded','canceled'].includes(current.state)&&verified.state!==current.state)return;
      if(verified.state==='succeeded'&&row.state!=='test_paid'){
        await order().update({where:{id:row.id},data:{state:'test_paid'}});
      }else if(verified.state==='canceled'&&row.state==='awaiting_payment'){
        await order().update({where:{id:row.id},data:{state:'cancelled'}});
      }
      await payments().update({where:{id:current.id},data:{providerId:verified.id,state:verified.state,confirmationUrl:verified.confirmationUrl,checkedAt:new Date()}});
    });
  }
  async function response(userId,reference){
    return owned(userId,reference,async row=>{
      const attempt=await payments().findOne({where:{orderReference:reference}});
      return {order:publicOrder(row),payment:attempt?{state:attempt.state,test:true,confirmationUrl:attempt.state==='pending'?attempt.confirmationUrl:null}:null};
    });
  }
  return {
    async start(userId,reference,returnOrigin){
      const cfg=config();
      const origin=returnOrigin||cfg.origin;
      if(!(cfg.allowedOrigins||[cfg.origin]).includes(origin))throw new PaymentError('invalid_payment_origin',400);
      const attempt=await owned(userId,reference,async row=>{
        const existing=await payments().findOne({where:{orderReference:reference}});
        if(existing){
          if(existing.shopId!==cfg.shopId||existing.mode!==cfg.mode)throw new PaymentError('payments_unavailable');
          return existing;
        }
        if(row.state!=='awaiting_payment'||new Date(row.expiresAt).getTime()<=Date.now())throw new PaymentError('order_not_payable',409);
        const attemptId=randomUUID();
        const requestBody={amount:{value:amount(Number(row.totalKopecks)),currency:'RUB'},capture:true,
          confirmation:{type:'redirect',return_url:origin+'/checkout/'+row.reference},
          description:'ThemesPhone · заказ '+row.reference,
          metadata:{order_id:row.reference,attempt_id:attemptId}};
        return payments().create({data:{orderReference:row.reference,attemptId,shopId:cfg.shopId,mode:'test',state:'creating',requestBody}});
      });
      await usingApi(cfg,async api=>{
        if(attempt.providerId){await save(attempt,await api.get(attempt.providerId),cfg);return;}
        // Never retry POST after the provider's 24-hour idempotency window.
        if(new Date(attempt.createdAt).getTime()<Date.now()-23*60*60*1000)throw new PaymentError('payment_review_required',409);
        await api.checkShop();
        await save(attempt,await api.create(attempt.requestBody,attempt.attemptId),cfg);
      });
      return response(userId,reference);
    },
    async refresh(userId,reference){
      const cfg=config();
      const attempt=await owned(userId,reference,()=>payments().findOne({where:{orderReference:reference}}));
      if(attempt?.providerId){
        if(attempt.shopId!==cfg.shopId||attempt.mode!==cfg.mode)throw new PaymentError('payments_unavailable');
        if(!['succeeded','canceled'].includes(attempt.state))await usingApi(cfg,async api=>save(attempt,await api.get(attempt.providerId),cfg));
      }
      return response(userId,reference);
    },
    async webhook(input){
      const cfg=config();
      if(!input||input.type!=='notification'||!['payment.succeeded','payment.canceled','payment.waiting_for_capture'].includes(input.event)||
        typeof input.object?.id!=='string'||!PAYMENT_ID.test(input.object.id))throw new PaymentError('invalid_notification',400);
      // The notification body never grants access. Unknown IDs cost no API request.
      let attempt=await payments().findOne({where:{providerId:input.object.id,shopId:cfg.shopId,mode:'test'}});
      if(!attempt&&typeof input.object.metadata?.attempt_id==='string'&&UUID.test(input.object.metadata.attempt_id)&&typeof input.object.metadata.order_id==='string'&&UUID.test(input.object.metadata.order_id)){
        attempt=await payments().findOne({where:{attemptId:input.object.metadata.attempt_id,orderReference:input.object.metadata.order_id,providerId:{$null:true},shopId:cfg.shopId,mode:'test'}});
      }
      if(!attempt)return {accepted:true};
      await usingApi(cfg,async api=>save(attempt,await api.get(attempt.providerId||input.object.id),cfg));
      return {accepted:true};
    },
  };
}
module.exports={PAYMENT,createPayments,lockOrder};
