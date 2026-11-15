import assert from 'node:assert/strict';
import {test,mock,afterEach} from 'node:test';
import {randomUUID} from 'node:crypto';
import {startCheckout,getCheckout,getOrders,cancelCheckout,paymentUnavailable,checkoutPayment,paymentNotification} from '../src/lib/checkout.ts';
import {normalizeCart,readCart,completeCartOrder,completePendingCartOrder,rememberCartOrder,forgetCartOrder} from '../src/lib/cart-storage.ts';
import {cartCheckout} from '../src/lib/cart-checkout.ts';
import {prepareQuickBuy,payQuickBuy,quickBuyStorageKey,readQuickBuyKey} from '../src/lib/quick-buy.ts';
const originalCms=process.env.STRAPI_API_URL;
const paymentEnv=Object.fromEntries(['PAYMENTS_ENABLED','PAYMENT_WEBHOOK_BRIDGE_SECRET'].map(key=>[key,process.env[key]]));
afterEach(()=>{mock.restoreAll();if(originalCms===undefined)delete process.env.STRAPI_API_URL;else process.env.STRAPI_API_URL=originalCms;for(const [key,value] of Object.entries(paymentEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
const id='a'.repeat(24),ref=randomUUID();
const input=()=>({items:[id],checkoutKey:randomUUID()});
const request=(data,origin='https://shop.example',cookie='token=user.session.jwt')=>new Request('https://shop.example/api/checkout/start',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(data)});
const order=()=>({id:ref,currency:'RUB',totalKopecks:29900,state:'awaiting_payment',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),items:[{documentId:id,title:'Обои',unitKopecks:29900,quantity:1}]});
test('BFF rejects forged origin, missing session and client-owned financial fields before contacting Strapi',async()=>{
  const fetch=mock.method(globalThis,'fetch',()=>{throw Error('Must not fetch');});
  assert.equal((await startCheckout(request(input(),'https://evil.example'))).status,403);
  assert.equal((await startCheckout(request(input(),'https://shop.example',''))).status,401);
  for(const key of ['amount','paid','owner','data','method'])assert.equal((await startCheckout(request({...input(),[key]:true}))).status,400);
  assert.equal(fetch.mock.callCount(),0);
});
test('orders use the user session only and whitelist the upstream response',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';const value=input(),expected=order();
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://cms:1337/api/shop-orders');assert.equal(options.headers.Authorization,'Bearer user.session.jwt');
    assert.deepEqual(JSON.parse(options.body),value);assert.equal(options.redirect,'error');
    return Response.json({...expected,owner:123,storageKey:'secret',jwt:'secret'});
  });
  const result=await startCheckout(request(value));assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{order:expected});
});
test('owner errors stay private; malformed successful responses and transport errors fail closed',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  mock.method(globalThis,'fetch',async()=>Response.json({error:'order_not_found',password:'must-not-leak'},{status:404}));
  const missing=await getCheckout(request({}),ref);assert.equal(missing.status,404);assert.deepEqual(await missing.json(),{error:'Заказ не найден.'});
  mock.restoreAll();mock.method(globalThis,'fetch',async()=>Response.json({...order(),totalKopecks:1}));
  assert.equal((await getCheckout(request({}),ref)).status,503);
  assert.equal((await getCheckout(request({}),'../orders')).status,404);
  assert.equal((await cancelCheckout(request({},'https://evil.example'),ref)).status,403);
});
test('legacy pay endpoint can no longer mark any order as paid',async()=>{
  const fetch=mock.method(globalThis,'fetch',()=>{throw Error('Must not fetch');});
  assert.equal(paymentUnavailable().status,503);assert.equal(fetch.mock.callCount(),0);
});
test('cart recovers from broken storage and migrates existing items without discarding them',()=>{
  const key=randomUUID(),item={id:1,documentId:id,title:'Обои',price:299,imageUrl:'/preview.jpg'};
  for(const text of ['{broken','null','"string"','{"version":2,"items":{}}'])assert.deepEqual(readCart(text,()=>key),{version:2,items:[],checkoutKey:key});
  assert.deepEqual(readCart(JSON.stringify([{...item,documentId:undefined}]),()=>key).items,[{id:1,title:'Обои',price:299,imageUrl:'/preview.jpg'}]);
  assert.equal(normalizeCart([item,item,{...item,id:2}]).length,1);
  assert.equal(normalizeCart([{...item,price:-1},{...item,id:'1'},{...item,imageUrl:'javascript:alert(1)'}]).length,0);
  assert.equal(readCart(JSON.stringify({version:2,items:[item],checkoutKey:key}),()=>{throw Error('Must keep retry key');}).checkoutKey,key);
});
test('a verified successful order removes its products and preserves products added during payment',()=>{
  const purchased={id:1,documentId:id,title:'Покупка',price:299,imageUrl:'/preview.jpg'};
  const added={...purchased,id:2,documentId:'b'.repeat(24),title:'Добавлено позже'};
  const cart={version:2,checkoutKey:randomUUID(),items:[purchased,added]};
  const newKey=randomUUID();
  for(const state of ['paid','test_paid']){
    const completed=completeCartOrder(cart,{id:ref,state,items:[{documentId:id}]},()=>newKey);
    assert.deepEqual(completed.items,[added]);assert.equal(completed.checkoutKey,newKey);assert.deepEqual(completed.completedOrders,[ref]);
  }
  for(const state of ['awaiting_payment','cancelled','expired'])assert.equal(completeCartOrder(cart,{id:ref,state,items:[{documentId:id}]},()=>{throw Error('Must not rotate key');}),cart);
});
test('reopening a settled order after reload does not remove a newly re-added product',()=>{
  const item={id:1,documentId:id,title:'Обои',price:299,imageUrl:'/preview.jpg'};
  const initial={version:2,checkoutKey:randomUUID(),items:[item]};
  const order={id:ref,state:'test_paid',items:[{documentId:id}]};
  const completed=completeCartOrder(initial,order,()=>randomUUID());
  const restored=readCart(JSON.stringify({...completed,items:[item]}),()=>{throw Error('Must keep saved key');});
  assert.equal(completeCartOrder(restored,order,()=>{throw Error('Must not rotate key');}),restored);
  assert.deepEqual(restored.items,[item]);
});

test('persisted checkouts reconcile on another page and keep products added during payment',()=>{
  const item={id:1,documentId:id,title:'Обои',price:299,imageUrl:'/preview.jpg'},other={...item,id:2,documentId:'b'.repeat(24)};
  const pending=rememberCartOrder({version:2,checkoutKey:randomUUID(),items:[item,other]},ref,42);
  const restored=readCart(JSON.stringify(pending),()=>randomUUID());
  assert.deepEqual(restored.pendingOrders,[{id:ref,userId:42}]);
  const result=completeCartOrder(restored,{id:ref,state:'paid',items:[{documentId:id}]},()=>randomUUID());
  assert.deepEqual(result.items,[other]);assert.deepEqual(result.pendingOrders,[]);
  assert.equal(rememberCartOrder(result,ref,42),result);
  assert.equal(forgetCartOrder(result,ref),result);
});

test('already purchased goods remain visible and contribute nothing to the new checkout',()=>{
  const item={id:1,documentId:id,title:'Обои',price:299,imageUrl:'/preview.jpg'},other={...item,id:2,documentId:'b'.repeat(24),price:120};
  for(const status of ['available','download_expired','file_unavailable']){
    const purchases={[id]:{documentId:id,orderId:ref,download:{status,expiresAt:null}}};
    assert.deepEqual(cartCheckout([item,other],purchases),{unpaid:[other],total:120});
    assert.deepEqual(cartCheckout([item],purchases),{unpaid:[],total:0});
  }
  assert.deepEqual(cartCheckout([item],{}),{unpaid:[item],total:299});
});

test('opening historical receipts on a new browser does not erase a re-added purchased item',()=>{
  const item={id:1,documentId:id,title:'Обои',price:299,imageUrl:'/preview.jpg'};
  const cart={version:2,checkoutKey:randomUUID(),items:[item]},paid={id:ref,state:'paid',items:[{documentId:id}]};
  const rotate=()=>randomUUID();
  assert.equal(completePendingCartOrder(cart,paid,42,rotate),cart);
  const tracked=rememberCartOrder(cart,ref,42);
  assert.equal(completePendingCartOrder(tracked,paid,43,rotate),tracked);
  assert.deepEqual(completePendingCartOrder(tracked,paid,42,rotate).items,[]);
});
test('payment BFF passes the session and stored order ID only, rejects forged redirects and financial input',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';process.env.PAYMENTS_ENABLED='true';
  const payment={state:'pending',test:true,confirmationUrl:'https://yoomoney.ru/api-pages/v2/payment-confirm/epl?orderId=fixture'};
  const expected=order();
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://cms:1337/api/shop-orders/'+ref+'/payment');assert.equal(options.headers.Authorization,'Bearer user.session.jwt');assert.equal(options.headers['X-Storefront-Origin'],'https://shop.example');assert.deepEqual(JSON.parse(options.body),{});
    return Response.json({order:expected,payment});
  });
  const valid=await checkoutPayment(request({}),ref);assert.equal(valid.status,200);assert.deepEqual(await valid.json(),{order:expected,payment});
  assert.equal((await checkoutPayment(request({return_url:'https://evil.example'}),ref)).status,400);
  assert.equal((await checkoutPayment(request({},'https://evil.example'),ref)).status,403);
  mock.restoreAll();mock.method(globalThis,'fetch',async()=>Response.json({order:expected,payment:{...payment,confirmationUrl:'https://evil.example'}}));
  assert.equal((await checkoutPayment(request({}),ref)).status,503);
});
test('webhook forwards only a bounded notification to an authenticated internal bridge, without browser credentials',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';process.env.PAYMENTS_ENABLED='true';process.env.PAYMENT_WEBHOOK_BRIDGE_SECRET='b'.repeat(43);
  const providerId=randomUUID();
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://cms:1337/api/payment-notifications/yookassa');assert.equal(options.headers['X-Payment-Bridge'],'b'.repeat(43));assert.equal(options.headers.Authorization,undefined);
    const value=JSON.parse(options.body);assert.equal(value.object.id,providerId);assert.equal(value.object.paid,undefined);
    return Response.json({accepted:true});
  });
  const response=await paymentNotification(request({type:'notification',event:'payment.succeeded',object:{id:providerId,paid:true}}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{accepted:true});
  assert.equal((await paymentNotification(request({type:'notification',event:'payment.succeeded',object:{id:'https://evil.example'}}))).status,400);
});
test('history uses only the current session, bounds pages and strips private original details',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  const expected={...order(),state:'test_paid',items:order().items.map(item=>({...item,download:{status:'available',fileId:'file123',expiresAt:null}}))};
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://cms:1337/api/shop-orders?page=2');assert.equal(options.headers.Authorization,'Bearer user.session.jwt');
    return Response.json({orders:[{...expected,owner:99,items:expected.items.map(item=>({...item,storageKey:'private',download:{...item.download,storageBucket:'private'}}))}],hasMore:false});
  });
  const request=url=>new Request(url,{headers:{Cookie:'token=user.session.jwt'}});
  const result=await getOrders(request('https://shop.example/api/account/orders?page=2'));assert.equal(result.status,200);assert.deepEqual(await result.json(),{orders:[expected],hasMore:false});
  for(const query of ['page=0','page=1&page=2','page=10000','owner=99','populate=*'])assert.equal((await getOrders(request('https://shop.example/api/account/orders?'+query))).status,400);
});

test('cart purchase lookup is scoped to selected IDs and the current user, and strips private fields',async()=>{
  process.env.STRAPI_API_URL='http://cms:1337';
  const key=randomUUID(),download={status:'available',fileId:'file123',expiresAt:null};
  const req=query=>new Request('https://shop.example/api/account/orders?'+query,{headers:{Cookie:'token=user.session.jwt'}});
  mock.method(globalThis,'fetch',async(url,options)=>{
    const query=new URL(url).searchParams;assert.equal(query.get('items'),id);assert.equal(query.get('checkoutKey'),key);
    assert.equal(options.headers.Authorization,'Bearer user.session.jwt');
    return Response.json({purchases:[{documentId:id,orderId:ref,download:{...download,storageKey:'secret'},owner:99}],checkoutOrder:null});
  });
  const result=await getOrders(req(new URLSearchParams({items:id,checkoutKey:key})));assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{purchases:[{documentId:id,orderId:ref,download}],checkoutOrder:null});
  for(const query of ['items='+id,'items='+id+'&checkoutKey=bad','items='+id+','+id+'&checkoutKey='+key,'items='+id+'&checkoutKey='+key+'&page=1','items='+id+'&checkoutKey='+key+'&owner=99'])assert.equal((await getOrders(req(query))).status,400);
});

test('buy now creates only the selected product and reuses a user-scoped retry key',async()=>{
  const key=randomUUID(),calls=[];
  assert.notEqual(quickBuyStorageKey(1,id),quickBuyStorageKey(2,id));
  assert.equal(readQuickBuyKey(key,()=>{throw Error('Must reuse key')}),key);
  assert.equal(readQuickBuyKey('broken',()=>key),key);
  mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push(url);
    if(url.startsWith('/api/account/orders?'))return Response.json({purchases:[],checkoutOrder:null});
    assert.equal(url,'/api/checkout/start');assert.deepEqual(JSON.parse(options.body),{items:[id],checkoutKey:key});
    return Response.json({order:order()});
  });
  const result=await prepareQuickBuy(id,key,new AbortController().signal);assert.equal(result.order.id,ref);assert.equal(calls.length,2);
});

test('buy now shows an existing purchase without creating another order or payment',async()=>{
  const purchase={documentId:id,orderId:ref,download:{status:'available',fileId:'file123',expiresAt:null}};
  const fetch=mock.method(globalThis,'fetch',async()=>Response.json({purchases:[purchase],checkoutOrder:null}));
  const result=await prepareQuickBuy(id,randomUUID(),new AbortController().signal);assert.deepEqual(result,{order:null,purchase});assert.equal(fetch.mock.callCount(),1);
});

test('buy now pays the stored server order and rejects a foreign provider redirect',async()=>{
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'/api/checkout/'+ref+'/payment');assert.deepEqual(JSON.parse(options.body),{});
    return Response.json({order:order(),payment:{confirmationUrl:'https://yoomoney.ru/api-pages/v2/payment-confirm/epl?orderId=fixture'}});
  });
  assert.match((await payQuickBuy(ref,new AbortController().signal)).href,/^https:\/\/yoomoney.ru\//);
  mock.restoreAll();mock.method(globalThis,'fetch',async()=>Response.json({order:order(),payment:{confirmationUrl:'https://evil.example/payment'}}));
  await assert.rejects(payQuickBuy(ref,new AbortController().signal));
});
