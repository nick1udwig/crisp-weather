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
test('network failure retries with backoff and missing callbacks cannot stall HTTP',()=>{
  const f=runtime(), service=create(f.env);
  service.start();f.locate();f.requests[0].onerror();
  f.advance(59999);assert.equal(f.locations.length,1);
  f.advance(1);f.locate();assert.equal(f.requests.length,2);
  f.advance(21000);assert(f.requests[1].aborted);
  f.respond(200,f.body(),1);assert.equal(f.sent.length,0);
  f.advance(5*60000);assert.equal(f.locations.length,3);
});
test('HTTP 429 obeys Retry-After across restarts and triggers',()=>{
  const f=runtime();let service=create(f.env);
  service.start();f.locate();f.requests[0].retryAfter='7200';f.respond(429);
  f.timers.clear();service=create(f.env);service.start();service.reconnect();
  f.advance(7199999);assert.equal(f.locations.length,1);
  f.advance(1);assert.equal(f.locations.length,2);
});
test('HTTP date Retry-After and absent headers both enforce cooldowns',()=>{
  for(const date of [false,true]){
    const f=runtime(), service=create(f.env);
    service.start();f.locate();
    if(date)f.requests[0].retryAfter=new Date(f.env.now()+2*3600000).toUTCString();
    f.respond(429);
    f.advance((date?2:1)*3600000-1);assert.equal(f.locations.length,1);
    f.advance(1);assert.equal(f.locations.length,2);
  }
});
test('Bluetooth retries never refetch and stop after three retries until reconnect',()=>{
  const f=runtime();f.env.deliveryError=true;
  const service=create(f.env);service.start();f.locate();f.respond();
  f.advance(80000);assert.equal(f.sent.length,4);assert.equal(f.requests.length,1);
  service.check();assert.equal(f.sent.length,4);
  f.env.deliveryError=false;service.reconnect();
  assert.equal(f.sent.length,5);assert.equal(f.requests.length,1);
});
test('a recent saved fix survives restart and is used only for unavailable location',()=>{
  const f=runtime();let service=create(f.env);service.start();f.locate();f.respond();
  f.timers.clear();f.advance(30*60000);service=create(f.env);service.start();
  f.locations[1].failure({code:2,message:'Unavailable'});
  assert.equal(f.requests.length,2);
  assert.match(f.requests[1].url,/latitude=37.77/);
  f.respond();f.advance(30*60000);
  f.locations[2].failure({code:1,message:'Denied'});
  assert.equal(f.requests.length,2);assert.match(service.status().message,/permission denied/);
});
test('manual coordinates bypass location permission and invalid coordinates never reach API',()=>{
  const f=runtime(), service=create(f.env);
  service.configure({WEATHER_LOCATION_MODE:'1',WEATHER_LATITUDE:'0',WEATHER_LONGITUDE:'0'});
  assert.equal(f.locations.length,0);assert.equal(f.requests.length,1);
  assert.match(f.requests[0].url,/latitude=0&longitude=0/);
  const bad=runtime(), invalid=create(bad.env);
  invalid.configure({WEATHER_LOCATION_MODE:'1',WEATHER_LATITUDE:'NaN',WEATHER_LONGITUDE:'181'});
  assert.equal(bad.requests.length,0);assert.match(invalid.status().message,/Manual location invalid/);
});
test('malformed JSON and HTTP 400 do not trigger fast retries',()=>{
  for(const [code,body] of [[200,'{broken'],[400,'bad request']]){
    const f=runtime(), service=create(f.env);service.start();f.locate();f.respond(code,body);
    f.advance(30*60000-1);assert.equal(f.requests.length,1);
    f.advance(1);assert.equal(f.locations.length,2);
  }
});
test('watch check resumes weather after phone timers have been suspended',()=>{
  const f=runtime(), service=create(f.env);service.start();f.locate();f.respond();
  f.timers.clear();f.advance(31*60000);service.check();
  assert.equal(f.locations.length,2);f.locate();assert.equal(f.requests.length,2);
  assert.match(service.diagnostics(),/Last success:/);
  assert.match(service.diagnostics(),/Forecast age: 31 minutes/);
  assert.match(service.diagnostics(),/Next allowed request:/);
});
test('location watchdog recovers from no callback and ignores late positions',()=>{
  const f=runtime(), service=create(f.env);service.start();f.advance(16000);
  assert.match(service.status().message,/Location unavailable/);
  f.locate(0);assert.equal(f.requests.length,0);
  f.advance(60000);assert.equal(f.locations.length,2);f.locate();assert.equal(f.requests.length,1);
});
test('an old saved location is not silently used',()=>{
  const f=runtime();f.values['crisp-weather-location-v1']=JSON.stringify({fix:{coords:{latitude:1,longitude:2},at:f.env.now()-7*3600000}});
  const service=create(f.env);service.start();f.locations[0].failure({code:2,message:'Unavailable'});
  assert.equal(f.requests.length,0);
});
test('late weather from an old location cannot overwrite the new location cache',()=>{
  const f=runtime(), service=create(f.env);service.start();f.locate();
  service.configure({WEATHER_LOCATION_MODE:'1',WEATHER_LATITUDE:'20',WEATHER_LONGITUDE:'30'});
  f.respond();assert.equal(f.sent.length,0);assert(f.requests[0].aborted);
  f.advance(60000);assert.equal(f.requests.length,2);
  assert.match(f.requests[1].url,/latitude=20&longitude=30/);
  f.respond();assert.equal(f.sent.length,1);
});
test('unavailable Retry-After header access still gives HTTP 429 a long cooldown',()=>{
  const f=runtime(), service=create(f.env);service.start();f.locate();
  f.requests[0].getResponseHeader=()=>{throw Error('Unavailable');};f.respond(429);
  f.advance(3599999);assert.equal(f.locations.length,1);
});
test('missing delivery callbacks have bounded retries without extra HTTP requests',()=>{
  const f=runtime();f.env.send=payload=>f.sent.push(payload);
  const service=create(f.env);service.start();f.locate();f.respond();
  f.advance(120000);assert.equal(f.sent.length,4);assert.equal(f.requests.length,1);
  service.check();assert.equal(f.sent.length,4);
});
