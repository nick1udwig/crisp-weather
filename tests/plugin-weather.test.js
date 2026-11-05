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
