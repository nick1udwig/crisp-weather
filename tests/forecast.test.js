const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parse, icon} = require('../src/pkjs/forecast');
function fixture() {
  return {hourly:{time:Array.from({length:48},(_,i)=>1700000000+i*3600),
    temperature_2m:Array(48).fill(-2.6), weather_code:Array(48).fill(61),
    is_day:Array(48).fill(1), precipitation_probability:Array(48).fill(80)},
    daily:{time:[1700000000,1700086400],temperature_2m_min:[-5],temperature_2m_max:[4]}};
}
test('selects current hour and packs 24 hours across midnight',()=>{
  const d=fixture(), p=parse(d,d.hourly.time[23]+3599);
  assert.equal(p.FORECAST_START,d.hourly.time[23]);
  assert.equal(p.FORECAST_DATA.length,48);
  assert.deepEqual(p.FORECAST_DATA.slice(0,2),[97,4]);
});
test('keeps valid components when hourly temperatures or rain are missing',()=>{
  const d=fixture(); d.hourly.temperature_2m[3]=null; d.hourly.precipitation_probability[0]=null;
  const p=parse(d,d.hourly.time[0]);
  assert.equal(p.FORECAST_DATA[6],255);
  assert.equal(p.WEATHER_TEMP_MIN,-5);
  assert.equal(p.WEATHER_PRECIP,undefined);
  assert.equal(parse(fixture(),1700000000+25*3600).FORECAST_DATA[46],255);
});
test('daily, hourly and rain data work independently',()=>{
  const d=fixture();
  assert.deepEqual(parse({daily:d.daily},1700000000),{WEATHER_TEMP_MIN:-5,WEATHER_TEMP_MAX:4,WEATHER_DAILY_UNTIL:1700086400});
  delete d.daily;
  assert.equal(parse(d,1700000000).WEATHER_PRECIP,80);
  d.hourly.weather_code[0]=null;
  assert.equal(parse(d,1700000000).FORECAST_DATA[1],7);
  d.hourly.is_day[0]=null;
  assert.equal(parse(d,1700000000).FORECAST_DATA[1],7);
  assert.throws(()=>parse({},1700000000),/No usable/);
  assert.throws(()=>parse(null,1700000000),/Invalid/);
});
test('groups conditions by icon and distinguishes clear nights',()=>{
  assert.equal(icon(0,1),0); assert.equal(icon(0,0),1);
  assert.equal(icon(2,1),icon(3,1)); assert.equal(icon(61,1),icon(63,1));
  assert.equal(icon(45,1),3); assert.equal(icon(75,1),5);
  assert.equal(icon(95,1),6); assert.equal(icon(123,1),7);
});
test('marks a timestamp gap as missing without shifting later samples',()=>{
  const d=fixture();d.hourly.time[5]+=3600;
  const p=parse(d,d.hourly.time[0]);
  assert.equal(p.FORECAST_DATA[10],255);
  assert.equal(p.FORECAST_DATA[12],97);
});
test('daily values change at the API local midnight without changing their expiry on replay',()=>{
  const d=fixture();d.daily.temperature_2m_min.push(1);d.daily.temperature_2m_max.push(8);
  const midnight=d.daily.time[1];
  assert.equal(parse(d,midnight-1).WEATHER_TEMP_MIN,-5);
  const next=parse(d,midnight);
  assert.equal(next.WEATHER_TEMP_MIN,1);
  assert.equal(next.WEATHER_DAILY_UNTIL,midnight+86400);
});
test('invalid numeric values do not fabricate temperatures, rain, or timestamps',()=>{
  const d=fixture();d.hourly.temperature_2m[0]=NaN;d.hourly.temperature_2m[1]=101;
  d.hourly.precipitation_probability[0]=-1;d.daily.temperature_2m_min[0]=12;
  const p=parse(d,d.hourly.time[0]);
  assert.equal(p.FORECAST_DATA[0],255);assert.equal(p.FORECAST_DATA[2],255);
  assert.equal(p.WEATHER_PRECIP,undefined);assert.equal(p.WEATHER_TEMP_MIN,undefined);
  assert.throws(()=>parse({hourly:{time:[1700000000.5],temperature_2m:[10]}},1700000001),/No usable/);
});
