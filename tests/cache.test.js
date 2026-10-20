const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../src/pkjs/weather-cache');
function store() {
  const data={};
  return {getItem:k=>data[k] || null,setItem:(k,v)=>{data[k]=v;}};
}
const now=1700000000;
function payload() {
  return {FORECAST_START:now,WEATHER_FETCHED_AT:now,FORECAST_DATA:Array(48).fill(1),
    WEATHER_TEMP_MIN:10,WEATHER_TEMP_MAX:20,WEATHER_DAILY_UNTIL:now+86400,
    WEATHER_PRECIP:30,WEATHER_RAIN_UNTIL:now+3600};
}
test('cache survives restart and each component expires independently',()=>{
  const storage=store(), cache=create(storage);
  cache.put(payload());
  assert.deepEqual(create(storage).get(now),payload());
  assert.equal(cache.get(now+3600).WEATHER_PRECIP,undefined);
  assert.equal(cache.get(now+10800).FORECAST_DATA,undefined);
  assert.equal(cache.get(now+86400),null);
  assert.equal(cache.get(now-400),null);
});
test('partial updates and replays never renew the forecast fetch time',()=>{
  const cache=create(store());cache.put(payload());
  cache.put({WEATHER_PRECIP:45,WEATHER_RAIN_UNTIL:now+7200});
  assert.equal(cache.get(now+3600).WEATHER_FETCHED_AT,now);
  assert.equal(cache.get(now+3600).WEATHER_PRECIP,45);
  assert.equal(cache.get(now+10800).FORECAST_DATA,undefined);
  cache.put({FORECAST_START:now+10800,WEATHER_FETCHED_AT:now+10800,FORECAST_DATA:Array(48).fill(2)});
  assert.equal(cache.get(now+10800).WEATHER_TEMP_MIN,10);
  assert.equal(cache.get(now+10800).WEATHER_PRECIP,undefined);
});
test('unavailable and corrupt storage cannot prevent weather delivery',()=>{
  const cache=create({getItem(){throw Error('disabled');},setItem(){throw Error('full');}});
  cache.put(payload());assert.deepEqual(cache.get(now),payload());
  assert.equal(create({getItem:()=>'{broken'}).get(now),null);
});
test('structurally corrupt cache can recover and persist a fresh payload',()=>{
  const storage=store();storage.setItem('crisp-weather-cache-v1','[]');
  const cache=create(storage);cache.put(payload());
  assert.deepEqual(create(storage).get(now),payload());
});
