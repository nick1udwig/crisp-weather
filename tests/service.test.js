const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../src/pkjs/weather-service');
const {runtime}=require('./helpers/weather');
test('triggers share one location/HTTP operation and restart uses the saved refresh deadline',()=>{
  const f=runtime(), service=create(f.env);
  service.start();service.check();assert.equal(f.locations.length,1);
  f.locate();service.check();assert.equal(f.requests.length,1);
  f.respond();assert.equal(f.sent.length,1);
  service.check();assert.equal(f.locations.length,1);
  f.timers.clear();create(f.env).start();assert.equal(f.locations.length,1);
  f.advance(30*60000);assert.equal(f.locations.length,2);
});
test('partial API success is cached and does not cause immediate refetch',()=>{
  const f=runtime(), service=create(f.env);
  service.start();f.locate();const data=f.body();delete data.hourly;
  f.respond(200,data);
  assert.equal(f.sent[0].WEATHER_TEMP_MIN,10);
  assert.equal(f.sent[0].FORECAST_DATA,undefined);
  service.check();assert.equal(f.requests.length,1);
});
