const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../src/pkjs/weather-scheduler');
function fixture() {
  let time=1700000000000;
  const values={};
  const storage={getItem:k=>values[k]||null,setItem:(k,v)=>{values[k]=v;}};
  return {storage,now:()=>time,advance:ms=>{time+=ms;}};
}
test('counts every attempt and enforces minute, rolling hour and rolling day budgets',()=>{
  const f=fixture(), s=create(f.storage,f.now);
  assert(s.reserve());assert(!s.reserve());assert.equal(s.wait(),60000);
  f.advance(60000);
  for(let i=1;i<6;i++){assert(s.reserve());f.advance(60000);}
  assert.equal(s.wait(),54*60000);assert(!s.reserve());
  f.advance(54*60000);
  assert(s.reserve());
  const d=fixture(), gate=create(d.storage,d.now);
  for(let i=0;i<96;i++){assert(gate.reserve());d.advance(10*60000);}
  assert.equal(gate.wait(),8*3600000);assert(!gate.reserve());
  d.advance(8*3600000);assert(gate.reserve());
});
test('restarts preserve successful refresh intervals and failed-attempt budgets',()=>{
  const f=fixture();let s=create(f.storage,f.now);
  assert(s.reserve());s.success();
  s=create(f.storage,f.now);assert.equal(s.wait(),30*60000);
  f.advance(30*60000);assert(s.reserve());
  assert.equal(create(f.storage,f.now).wait(),60000);
});
test('clock rollback preserves remaining cooldown and request history',()=>{
  const f=fixture();let s=create(f.storage,f.now);
  assert(s.reserve());s.defer(3600000);
  f.advance(-3600000);s=create(f.storage,f.now);
  assert.equal(s.wait(),3600000);assert(!s.reserve());
  f.advance(3600000);assert(s.reserve());
});
test('HTTP is blocked if request history cannot be read or saved',()=>{
  const f=fixture();
  assert(!create({getItem(){throw Error('disabled');},setItem(){}},f.now).reserve());
  assert(!create({getItem:()=>null,setItem(){throw Error('full');}},f.now).reserve());
});
test('transient backoff and repeated rate limits survive restarts',()=>{
  const f=fixture();let s=create(f.storage,f.now,()=>0);
  for(const minutes of [1,5,15,30,30]) {
    s.failure('transient');assert.equal(s.wait(),minutes*60000);
    f.advance(minutes*60000);s=create(f.storage,f.now,()=>0);
  }
  s.failure('rate');assert.equal(s.wait(),3600000);
  f.advance(3600000);s=create(f.storage,f.now,()=>0);
  s.failure('rate');assert.equal(s.wait(),7200000);
  f.advance(7200000);s.failure('rate',180000);assert.equal(s.wait(),180000);
});
test('corrupt history is repaired with a persisted conservative cooldown',()=>{
  const f=fixture();f.storage.setItem('crisp-weather-schedule-v1','{broken');
  let s=create(f.storage,f.now);assert.equal(s.wait(),86400000);assert(!s.reserve());
  f.advance(3600000);s=create(f.storage,f.now);assert.equal(s.wait(),23*3600000);
  f.advance(23*3600000);assert(s.reserve());
});
test('continuous outage with repeated reconnects stays within every rolling budget',()=>{
  const f=fixture(), attempts=[];let s=create(f.storage,f.now,()=>0);
  for(let minute=0;minute<3*24*60;minute++){
    if(minute%7===0)s=create(f.storage,f.now,()=>0);
    for(let trigger=0;trigger<3;trigger++)if(s.reserve())attempts.push(f.now());
    f.advance(60000);
  }
  for(const end of attempts){
    for(const [window,limit] of [[60000,1],[3600000,6],[86400000,96]]){
      assert(attempts.filter(t=>t<=end && t>end-window).length<=limit);
    }
  }
});
