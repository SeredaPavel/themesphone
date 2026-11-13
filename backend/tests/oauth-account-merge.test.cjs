'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mergePlan}=require('../src/lib/oauth-account-merge');
const user=(id,extra={})=>({id,email:null,password:null,confirmed:true,blocked:false,role:{id:1,type:'authenticated'},...extra});
const identity=(id,provider)=>({id,provider,key:'key-'+id});

test('email login remains the primary account when linking a separate OAuth profile',()=>{
  const email=user(2,{email:'owner@example.test',password:'existing-hash'}),oauth=user(1);
  const plan=mergePlan(email,oauth,[],[identity(1,'google')]);
  assert.equal(plan.primary,email);assert.equal(plan.secondary,oauth);assert.equal(plan.primary.password,'existing-hash');
});
test('reverse linking retains the existing email account and all non-conflicting services',()=>{
  const oauth=user(2),email=user(1,{email:'owner@example.test',password:'existing-hash'});
  const plan=mergePlan(oauth,email,[identity(2,'telegram')],[identity(1,'google')]);
  assert.equal(plan.primary,email);assert.equal(plan.secondary,oauth);assert.deepEqual(plan.identities.map(row=>row.provider),['telegram','google']);
});
test('two passwordless profiles can keep the current profile without inventing an email',()=>{
  const current=user(2),other=user(1);
  assert.equal(mergePlan(current,other,[identity(2,'yandex')],[identity(1,'google')]).primary,current);
});
test('conflicting email credentials or two different accounts of one provider are never discarded',()=>{
  assert.throws(()=>mergePlan(user(1,{email:'first@example.test'}),user(2,{email:'second@example.test'}),[identity(1,'google')],[identity(2,'yandex')]),error=>error.code==='merge_email_conflict');
  assert.throws(()=>mergePlan(user(1),user(2),[identity(1,'google')],[identity(2,'google')]),error=>error.code==='merge_provider_conflict');
});
test('blocked, unconfirmed, already merged, role-mismatched and privileged accounts are refused',()=>{
  for(const change of [{blocked:true},{confirmed:false},{mergedIntoUserId:99}]) assert.throws(()=>mergePlan(user(1,change),user(2),[identity(1,'google')],[identity(2,'yandex')]),error=>error.code==='merge_changed');
  for(const role of [{id:2,type:'authenticated'},{id:1,type:'admin'}]) assert.throws(()=>mergePlan(user(1,{role}),user(2),[identity(1,'google')],[identity(2,'yandex')]),error=>error.code==='merge_role_conflict');
});
