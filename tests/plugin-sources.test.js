const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../src/pkjs/plugin-sources');
test('shared subscriptions retry failed setup once and ignore callbacks from failed attempts',()=>{
  const attempts=[], values=[], errors=[];let available=false, closed=0;
  const hub=create({subscribeToSource(request){attempts.push(request);if(!available)throw new Error('Unavailable');return {unsubscribe(){closed++;}};}});
  const binding={category:'weather',item:'location'};
  const first=hub.subscribe(binding,value=>values.push(['first',value]),error=>errors.push(error));
  const second=hub.subscribe(binding,value=>values.push(['second',value]),error=>errors.push(error));
  assert.equal(attempts.length,2);assert.equal(errors.length,3);
  available=true;first.retry();second.retry();assert.equal(attempts.length,3);
  attempts[0].onData('old');attempts[1].onError({code:'TIMEOUT'});assert.deepEqual(values,[]);assert.equal(errors.length,3);
  attempts[2].onData('fresh');assert.deepEqual(values,[['first','fresh'],['second','fresh']]);
  first.unsubscribe();first.retry();assert.equal(closed,0);
  second.unsubscribe();second.retry();assert.equal(closed,1);assert.equal(attempts.length,3);
});
test('discarded failed subscriptions do not restart on retry',()=>{
  let calls=0;
  const hub=create({subscribeToSource(){calls++;throw new Error('Unavailable');}});
  const subscription=hub.subscribe({category:'test',item:'item'},()=>{},()=>{});
  subscription.unsubscribe();subscription.retry();assert.equal(calls,1);
});
