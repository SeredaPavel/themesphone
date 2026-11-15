'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {inputOrder,priceKopecks,publicOrder}=require('../src/lib/shop-orders');
const id='a'.repeat(24);

test('checkout accepts only unique document IDs and a retry key',()=>{
  const input={items:[id],checkoutKey:randomUUID()};
  assert.deepEqual(inputOrder(input).items,[id]);
  for(const key of ['amount','paid','owner','currency','paymentId','data','users_permissions_user'])assert.throws(()=>inputOrder({...input,[key]:1}));
  for(const items of [[],[id,id],[1],['../orders'],Array.from({length:31},(_,i)=>String(i).padStart(24,'a'))])assert.throws(()=>inputOrder({...input,items}));
  for(const checkoutKey of ['',1,null,'not-a-uuid'])assert.throws(()=>inputOrder({...input,checkoutKey}));
  assert.equal(inputOrder({...input,items:[id,'b'.repeat(24)]}).requestHash,inputOrder({...input,items:['b'.repeat(24),id]}).requestHash);
});
test('Strapi integer ruble prices become exact integer kopecks',()=>{
  assert.equal(priceKopecks('299'),29900);assert.equal(priceKopecks(1),100);
  for(const value of [null,'',0,-1,'299.5',1.1,'1e3',1000001,Infinity,'9007199254740993'])assert.throws(()=>priceKopecks(value));
});
test('order response strips all private fields and represents expiration without changing payment state',()=>{
  const row={reference:randomUUID(),currency:'RUB',totalKopecks:'29900',state:'awaiting_payment',createdAt:new Date().toISOString(),expiresAt:'2020-01-01T00:00:00Z',
    owner:123,checkoutKey:'secret',requestHash:'secret',items:[{documentId:id,title:'Обои',unitKopecks:29900,quantity:1,originalFileId:'private'}]};
  const result=publicOrder(row);assert.equal(result.state,'expired');assert.equal(result.totalKopecks,29900);
  assert.equal(result.owner,undefined);assert.equal(result.checkoutKey,undefined);assert.equal(result.items[0].originalFileId,undefined);
  assert.equal(publicOrder({...row,state:'paid'}).state,'paid');
});
