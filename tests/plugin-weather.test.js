const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runtime}=require('./helpers/weather');
const {create}=require('../src/pkjs/plugin-weather');
function fixture(){
  const f=runtime(),requests=[];
  const env=f.env;
  env.sources={subscribe(binding,data,error){const sub={binding,data,error,closed:false,unsubscribe(){this.closed=true;}};requests.push(sub);return sub;}};
  const service=create(env,'home');service.start();
  const start=Math.floor(f.env.now()/3600000)*3600;
  const envelope={validUntilMs:f.env.now()+60000,instances:[{instanceId:'home',properties:{
    hourly_temperature:{series:{start,stepSec:3600,numericValue:{values:Array(24).fill(18),unit:'°C'}}}
  }}]};
  return {...f,env,requests,service,envelope};
}
test('plugin delivery and restart replay preserve original timestamps',()=>{
  const f=fixture();f.requests[0].data(f.envelope);
  const original=f.sent.at(-1);f.advance(10000);f.service.reconnect();
  assert.deepEqual(f.sent.at(-1),original);
  f.service.stop();const resumed=create(f.env,'home');resumed.start();
  assert.deepEqual(f.sent.at(-1),original);
  f.requests.at(-1).data(f.envelope);assert.deepEqual(f.sent.at(-1),original);
});
test('expiry clears the watch without refetching and permission denial discards cached weather',()=>{
  const f=fixture();f.requests[0].data(f.envelope);f.advance(60000);f.service.check();
  assert.deepEqual(f.sent.at(-1),{WEATHER_RESET:1});assert.equal(f.requests.length,1);
  f.envelope.validUntilMs+=60000;f.requests[0].data(f.envelope);
  f.requests[0].error({code:'PERMISSION_DENIED'});assert.deepEqual(f.sent.at(-1),{WEATHER_RESET:1});
  const count=f.sent.length;f.service.stop();f.requests[0].data(f.envelope);assert.equal(f.sent.length,count);
});
test('transient errors retain valid data and failed sends retry on reconnect',()=>{
  const f=fixture();f.requests[0].data(f.envelope);const payload=f.sent.at(-1);
  f.requests[0].error({code:'TIMEOUT'});f.service.reconnect();assert.deepEqual(f.sent.at(-1),payload);
  f.env.deliveryError=true;f.service.reconnect();f.env.deliveryError=false;
  const count=f.sent.length;f.service.check();assert.equal(f.sent.length,count+1);
});
test('cached payload is revalidated instead of trusting persisted wire values',()=>{
  const f=fixture();f.requests[0].data(f.envelope);
  const cached=JSON.parse(f.values['crisp-plugin-weather-v1']);cached.payload.FORECAST_DATA=Array(1000).fill(1);
  f.env.storage.setItem('crisp-plugin-weather-v1',JSON.stringify(cached));
  const resumed=create(f.env,'home');resumed.start();assert.equal(f.sent.at(-1).FORECAST_DATA.length,48);
});
for (const trigger of ['check','reconnect']) test(`weather retries a failed subscription on ${trigger} without restarting`,()=>{
  const f=runtime(), attempts=[];
  const sources=require('../src/pkjs/plugin-sources').create({subscribeToSource(request){
    attempts.push(request);
    if(attempts.length===1) throw new Error('Startup failure');
    return {unsubscribe(){}};
  }},f.env.now);
  const service=create({...f.env,sources},'home');service.start();
  assert.equal(attempts.length,1);
  service[trigger]();assert.equal(attempts.length,2);
  const start=Math.floor(f.env.now()/3600000)*3600;
  attempts[1].onData({validUntilMs:f.env.now()+60000,instances:[{instanceId:'home',properties:{
    hourly_temperature:{series:{start,stepSec:3600,numericValue:{values:[18],unit:'°C'}}}
  }}]});
  assert.equal(f.sent.at(-1).FORECAST_DATA[0],118);
  attempts[0].onError({code:'PERMISSION_DENIED'});
  service[trigger]();assert.equal(attempts.length,2);assert.equal(f.sent.at(-1).FORECAST_DATA[0],118);
  attempts[1].onError({code:'TIMEOUT'});service[trigger]();assert.equal(attempts.length,2);
  service.stop();service[trigger]();assert.equal(attempts.length,2);
});
test('a weather subscriber cannot renew old shared data without a source update',()=>{
  const f=runtime();let request;
  const sources=require('../src/pkjs/plugin-sources').create({subscribeToSource(r){request=r;return {unsubscribe(){}};}},f.env.now);
  sources.subscribe({category:'weather',item:'location'},()=>{},()=>{});
  const received=Math.floor(f.env.now()/1000),start=Math.floor(received/3600)*3600;
  const envelope={instances:[{instanceId:'home',properties:{
    hourly_temperature:{series:{start,stepSec:3600,numericValue:{values:Array(24).fill(18),unit:'°C'}}}
  }}]};
  request.onData(envelope);f.advance(60000);
  const service=create({...f.env,sources},'home');service.start();
  assert.equal(f.sent.at(-1).WEATHER_FETCHED_AT,received);
  assert.equal(f.sent.at(-1).WEATHER_VALID_UNTIL,received+1800);
  f.advance(1800000);service.check();assert.deepEqual(f.sent.at(-1),{WEATHER_RESET:1});
  service.stop();const resumed=create({...f.env,sources},'home');resumed.start();
  assert.deepEqual(f.sent.at(-1),{WEATHER_RESET:1});
  request.onData(envelope);assert.equal(f.sent.at(-1).WEATHER_FETCHED_AT,Math.floor(f.env.now()/1000));
  assert.equal(f.sent.at(-1).WEATHER_VALID_UNTIL,Math.floor(f.env.now()/1000)+1800);
});
test('startup restores the selected plugin location from settings',()=>{
  const f=fixture();f.requests[0].data(f.envelope);const original=f.sent.at(-1);f.service.stop();
  f.env.storage.setItem('clay-settings',JSON.stringify({WEATHER_PLUGIN_INSTANCE:'home'}));
  const resumed=create(f.env);resumed.start();assert.deepEqual(f.sent.at(-1),original);
});
test('changing location clears old weather and ignores old subscription callbacks',()=>{
  const f=fixture();f.requests[0].data(f.envelope);
  f.service.configure('work');assert(f.requests[0].closed);assert.equal(f.requests.length,2);
  assert.deepEqual(f.sent.at(-1),{WEATHER_RESET:1});
  assert.equal(JSON.parse(f.values['crisp-plugin-weather-v1']),null);
  const count=f.sent.length;
  f.requests[0].data(f.envelope);f.requests[0].error({code:'PERMISSION_DENIED'});
  assert.equal(f.sent.length,count);
  const work=JSON.parse(JSON.stringify(f.envelope));work.instances[0].instanceId='work';
  work.instances[0].properties.hourly_temperature.series.numericValue.values.fill(22);
  f.requests[1].data(work);assert.equal(f.sent.at(-1).FORECAST_DATA[0],122);
  f.requests[0].error({code:'PERMISSION_DENIED'});
  f.service.reconnect();assert.equal(f.sent.at(-1).FORECAST_DATA[0],122);
  f.service.configure('work');f.service.configure(undefined);assert.equal(f.requests.length,2);
  f.service.configure('');assert.deepEqual(f.sent.at(-1),{WEATHER_RESET:1});
  f.requests[2].data(f.envelope);assert.equal(f.sent.at(-1).FORECAST_DATA[0],118);
});
test('a late failed delivery for the previous location cannot invalidate the current delivery',()=>{
  const f=fixture(),failures=[];
  f.env.send=(payload,success,failure)=>{f.sent.push(payload);failures.push(failure);success();};
  f.service.reconnect();const previous=failures.at(-1);
  f.service.configure('work');previous();
  const count=f.sent.length;f.service.check();assert.equal(f.sent.length,count);
});
