'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {randomUUID}=require('node:crypto');
const {configuration,confirmationUrl,amount,validatePayment,createYooKassa}=require('../src/lib/yookassa');
const env={PAYMENTS_ENABLED:'true',PAYMENT_PROVIDER:'yookassa',YOOKASSA_MODE:'test',YOOKASSA_SHOP_ID:'123',YOOKASSA_SECRET_KEY:'test_fixture',PAYMENT_RETURN_ORIGIN:'http://127.0.0.1:3100'};
test('payment configuration refuses live keys, disabled mode and untrusted return URLs',()=>{
  assert.equal(configuration(env).mode,'test');
  for(const fields of [{PAYMENTS_ENABLED:'false'},{YOOKASSA_MODE:'live'},{YOOKASSA_SECRET_KEY:'live_key'},{PAYMENT_RETURN_ORIGIN:'http://example.com'},{PAYMENT_RETURN_ORIGIN:'https://example.com/path'},{PAYMENT_RETURN_ORIGIN:'https://user:password@example.com/'}])assert.throws(()=>configuration({...env,...fields}));
  assert.equal(amount(29901),'299.01');for(const value of [-1,0,1.2,NaN])assert.throws(()=>amount(value));
});
test('only our provider payment URL can become a redirect',()=>{
  assert.equal(new URL(confirmationUrl('https://yoomoney.ru/api-pages/v2/payment-confirm/epl?orderId=fixture')).hostname,'yoomoney.ru');
  for(const value of ['https://evil.example','https://yoomoney.ru.evil.example/api-pages/v2/payment-confirm/epl','https://evil@yoomoney.ru/api-pages/v2/payment-confirm/epl','https://yoomoney.ru/unknown','http://yoomoney.ru/api-pages/v2/payment-confirm/epl'])assert.throws(()=>confirmationUrl(value));
});
test('test flag, merchant, amount, currency, identity and metadata all match before accepting success',()=>{
  const expected={paymentId:randomUUID(),shopId:'123',totalKopecks:29900,orderId:randomUUID(),attemptId:randomUUID()};
  const raw={id:expected.paymentId,test:true,status:'succeeded',paid:true,recipient:{account_id:'123'},amount:{value:'299.00',currency:'RUB'},metadata:{order_id:expected.orderId,attempt_id:expected.attemptId}};
  assert.equal(validatePayment(raw,expected).state,'succeeded');
  for(const change of [{id:randomUUID()},{test:false},{paid:false},{status:'unknown'},{recipient:{account_id:'456'}},{amount:{value:'1.00',currency:'RUB'}},{amount:{value:'299.00',currency:'USD'}},{metadata:{order_id:randomUUID(),attempt_id:expected.attemptId}}])assert.throws(()=>validatePayment({...raw,...change},expected));
});
test('transport uses fixed HTTPS endpoint, Basic auth and the persisted idempotency key',async()=>{
  const calls=[];
  const api=createYooKassa(configuration(env),async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Basic '+Buffer.from('123:test_fixture').toString('base64'));
    if(url.endsWith('/me'))return Response.json({test:true,account_id:'123',status:'enabled'});
    assert.equal(options.headers['Idempotence-Key'],'persisted-key');assert.equal(JSON.parse(options.body).capture,true);return Response.json({id:'fixture'});
  });
  try{await api.checkShop();await api.create({capture:true},'persisted-key');assert.deepEqual(calls,['https://api.yookassa.ru/v3/me','https://api.yookassa.ru/v3/payments']);}finally{await api.close();}
});
