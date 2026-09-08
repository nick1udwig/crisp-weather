const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parse, icon} = require('../src/pkjs/forecast');
function fixture() {
  return {hourly:{time:Array.from({length:48},(_,i)=>1700000000+i*3600),
    temperature_2m:Array(48).fill(-2.6), weather_code:Array(48).fill(61),
    is_day:Array(48).fill(1), precipitation_probability:Array(48).fill(80)},
    daily:{temperature_2m_min:[-5],temperature_2m_max:[4]}};
}
test('selects current hour and packs 24 hours across midnight',()=>{
  const d=fixture(), p=parse(d,d.hourly.time[23]+3599);
  assert.equal(p.FORECAST_START,d.hourly.time[23]);
  assert.equal(p.FORECAST_DATA.length,48);
  assert.deepEqual(p.FORECAST_DATA.slice(0,2),[97,4]);
});
test('rejects missing, null and incomplete weather instead of fabricating clear skies',()=>{
  const d=fixture(); d.hourly.temperature_2m[3]=null;
  assert.throws(()=>parse(d,d.hourly.time[0]));
  assert.throws(()=>parse(fixture(),1700000000+25*3600));
});
test('groups conditions by icon and distinguishes clear nights',()=>{
  assert.equal(icon(0,1),0); assert.equal(icon(0,0),1);
  assert.equal(icon(2,1),icon(3,1)); assert.equal(icon(61,1),icon(63,1));
  assert.equal(icon(45,1),3); assert.equal(icon(75,1),5);
  assert.equal(icon(95,1),6); assert.equal(icon(123,1),7);
});
test('rejects noncontiguous hourly timestamps',()=>{
  const d=fixture();d.hourly.time[5]+=3600;
  assert.throws(()=>parse(d,d.hourly.time[0]));
});
