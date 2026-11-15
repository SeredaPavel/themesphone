import assert from 'node:assert/strict';
import {test,mock,afterEach} from 'node:test';
import {randomUUID} from 'node:crypto';
import {startCheckout,getCheckout,cancelCheckout,paymentUnavailable} from '../src/lib/checkout.ts';
import {normalizeCart,readCart} from '../src/lib/cart-storage.ts';
const originalCms=process.env.STRAPI_API_URL;
afterEach(()=>{mock.restoreAll();if(originalCms===undefined)delete process.env.STRAPI_API_URL;else process.env.STRAPI_API_URL=originalCms;});
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
