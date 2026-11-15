'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {access,downloadDaysSetting}=require('../src/lib/order-downloads');
const row={reference:randomUUID(),state:'test_paid',totalKopecks:'29900',downloadDays:0,paidAt:'2026-11-01T00:00:00Z'};
const item={documentId:'a'.repeat(24),originalFileId:'b'.repeat(24)};
const payment={mode:'test',state:'succeeded',providerId:randomUUID(),attemptId:randomUUID()};
payment.requestBody={amount:{value:'299.00',currency:'RUB'},metadata:{order_id:row.reference,attempt_id:payment.attemptId}};
const file={documentId:item.originalFileId,wallpaperDocumentId:item.documentId,ready:true,testOnly:true};
test('test orders unlock test originals only; legacy paid flags and mismatched proof fail closed',()=>{
  assert.equal(access(row,payment,item,file).status,'available');
  assert.equal(access(row,payment,item,{...file,testOnly:false}).status,'test_purchase');
  for(const proof of [null,{...payment,state:'pending'},{...payment,mode:'live'},{...payment,requestBody:{...payment.requestBody,amount:{value:'1.00',currency:'RUB'}}}])assert.equal(access(row,proof,item,file).status,'payment_required');
  assert.equal(access({...row,state:'paid',paid:true},payment,item,file).status,'payment_required');
  assert.equal(access(row,{...payment,refunded:true},item,file).status,'access_revoked');
  assert.equal(access(row,payment,item,{...file,documentId:'wrong'}).status,'file_unavailable');
});
test('repeat access is unlimited at zero; a fixed period expires exactly at its boundary',()=>{
  assert.equal(access(row,payment,item,file,Date.parse('2099-01-01')).expiresAt,null);
  const timed={...row,downloadDays:30};const boundary=Date.parse('2026-12-01T00:00:00Z');
  assert.equal(access(timed,payment,item,file,boundary-1).status,'available');
  assert.equal(access(timed,payment,item,file,boundary).status,'download_expired');
  assert.equal(access(timed,payment,item,file,boundary).expiresAt,'2026-12-01T00:00:00.000Z');
  for(const value of ['30','0','3650'])assert.equal(downloadDaysSetting(value),Number(value));
  for(const value of ['-1','2.5','forever','3651'])assert.throws(()=>downloadDaysSetting(value));
});
