const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runtime}=require('./helpers/weather');
const {create}=require('../src/pkjs/delivery');
test('serializes messages and replaces pending corner values',()=>{
  const pending=[], sent=[], callbacks=[];
  const queue=create({send:(payload,ok,fail)=>{sent.push(payload);pending.push({ok,fail});},setTimeout:()=>{},clearTimeout:()=>{}});
  queue.send({settings:1},()=>callbacks.push('settings'));
  queue.send({value:1},null,null,'corner-0');queue.send({value:2},()=>callbacks.push('corner'),null,'corner-0');
  assert.equal(sent.length,1);pending.shift().ok();assert.deepEqual(sent,[{settings:1},{value:2}]);
  pending.shift().ok();assert.deepEqual(callbacks,['settings','corner']);
});
test('retries failed delivery then releases the queue',()=>{
  const f=runtime();f.env.deliveryError=true;
  const queue=create(f.env);let failures=0;
  queue.send({value:1},null,()=>failures++);
  queue.send({value:2});f.advance(3000);assert.equal(failures,1);
  f.env.deliveryError=false;f.advance(1000);assert.equal(f.sent.at(-1).value,2);
});

test('missing callbacks cannot block later messages and late callbacks are ignored',()=>{
  const f=runtime(), calls=[];let failed=0;
  const queue=create({...f.env,send:(payload,ok)=>calls.push({payload,ok})});
  queue.send({value:1},null,()=>failed++);queue.send({value:2});
  f.advance(33000);assert.equal(failed,1);assert.equal(calls.at(-1).payload.value,2);
  calls[0].ok();assert.equal(calls.length,4);
  calls.at(-1).ok();f.advance(60000);assert.equal(calls.length,4);
});
