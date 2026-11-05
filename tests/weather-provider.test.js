const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runtime}=require('./helpers/weather');
const {create}=require('../src/pkjs/weather-provider');
function fixture(saved={}) {
  const f=runtime(),subscriptions=[];
  f.env.storage.setItem('clay-settings',JSON.stringify(saved));
  f.env.sources={subscribe(binding,data,error){const s={binding,data,error,closed:false,unsubscribe(){this.closed=true;}};subscriptions.push(s);return s;}};
  return {...f,subscriptions,provider:create(f.env)};
}
test('plugin is the default and permission errors never fall back to direct HTTP',()=>{
  const f=fixture();f.provider.start();
  assert.equal(f.subscriptions.length,1);assert.equal(f.locations.length,0);assert.equal(f.requests.length,0);
  f.subscriptions[0].error({code:'PERMISSION_DENIED'});f.provider.reconnect();f.advance(3600000);
  assert.equal(f.requests.length,0);assert.equal(f.locations.length,0);
  assert(f.provider.diagnostics().includes('PERMISSION_DENIED'));
});
test('switching away from Open-Meteo cancels HTTP and ignores late replies',()=>{
  const f=fixture({WEATHER_PROVIDER:'open-meteo'});f.provider.start();f.locate();
  const request=f.requests[0];
  f.provider.configure({WEATHER_PROVIDER:'plugin',WEATHER_PLUGIN_INSTANCE:'home'});
  assert(request.aborted);const count=f.sent.length;
  f.respond();assert.equal(f.sent.length,count);f.advance(3600000);
  assert.equal(f.requests.length,1);assert.equal(f.locations.length,1);
});
test('switching plugin location clears weather and unsubscribes the previous source',()=>{
  const f=fixture();f.provider.start();const first=f.subscriptions[0];
  f.provider.configure({WEATHER_PROVIDER:'plugin',WEATHER_PLUGIN_INSTANCE:'home'});
  assert(first.closed);assert.deepEqual(f.sent.at(-1),{WEATHER_RESET:1});
  const count=f.sent.length;first.data({instances:[]});assert.equal(f.sent.length,count);
});
test('explicit legacy choice retains manual coordinates and request budgeting',()=>{
  const f=fixture();f.provider.start();
  f.provider.configure({WEATHER_PROVIDER:'open-meteo',WEATHER_LOCATION_MODE:'1',WEATHER_LATITUDE:'0',WEATHER_LONGITUDE:'0'});
  assert(f.subscriptions[0].closed);assert.equal(f.locations.length,0);assert.equal(f.requests.length,1);
  f.respond();assert.equal(f.sent.at(-1).WEATHER_RESET,1);assert.equal(f.sent.at(-1).FORECAST_DATA.length,48);
  for(let i=0;i<10;i++) f.provider.reconnect();
  assert.equal(f.requests.length,1);
});
