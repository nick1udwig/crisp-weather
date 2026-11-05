const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {runtime} = require('../tests/helpers/weather');
const config = require('../src/pkjs/config');
const keys = JSON.parse(fs.readFileSync('build/js/message_keys.json','utf8'));
const source = fs.readFileSync('build/pebble-js-app.js','utf8');
const manifest = require('../package.json').pebble;
assert.deepEqual(keys,manifest.messageKeys);
assert.equal(keys.WEATHER_REQUEST,10034);
assert.equal(keys.WEATHER_VALID_UNTIL,10039);
for(const retired of [10031,10032,10033]) assert(!Object.values(keys).includes(retired));
const f = runtime(), subscriptions = [];
f.env.storage.setItem('clay-settings',JSON.stringify({WEATHER_PROVIDER:'open-meteo',WEATHER_LATITUDE:'1',WEATHER_LONGITUDE:'2'}));
class ClockDate extends Date { static now() { return f.env.now(); } }
function launch() {
  const events = {};
  vm.runInNewContext(source,{
    localStorage:f.env.storage,Date:ClockDate,Math,encodeURIComponent,decodeURIComponent,
    setTimeout:f.env.setTimeout,clearTimeout:f.env.clearTimeout,
    console:{log:f.env.log,error:f.env.log},
    Pebble:{addEventListener:(name,fn)=>{(events[name] ||= []).push(fn);},
      getActiveWatchInfo:()=>({platform:'emery'}),getAccountToken:()=>'',getWatchToken:()=>'',
      subscribeToSource:request=>{subscriptions.push(request);return {unsubscribe(){}};},
      sendAppMessage:f.env.send,openURL:url=>{assert(url.startsWith('data:'));}}
  });
  const fire=(name,event)=>events[name].forEach(fn=>fn(event));
  fire('ready');return fire;
}
const fire=launch();
assert.deepEqual(JSON.parse(f.values['clay-settings']),{});
const settings=Object.fromEntries(config.flatMap(item=>item.items||[item]).filter(item=>item.messageKey)
  .map(item=>[item.messageKey,{value:item.type==='color'?parseInt(item.defaultValue,16):item.defaultValue}]));
fire('webviewclosed',{response:JSON.stringify(settings)});
const outgoing=f.sent.find(message=>Object.hasOwn(message,keys.THEME));
assert.equal(outgoing[keys.THEME],'0');
assert(Object.keys(outgoing).every(key=>Object.values(keys).includes(Number(key))));
function size(message) {
  return 1+Object.values(message).reduce((n,v)=>n+7+(typeof v==='string'?Buffer.byteLength(v)+1:Array.isArray(v)?v.length:4),0);
}
assert(size(outgoing)<=256);
const start=Math.floor(f.env.now()/3600000)*3600;
subscriptions.find(request=>request.category==='weather').onData({validUntilMs:f.env.now()+3600000,instances:[{instanceId:'home',properties:{
  hourly_temperature:{series:{start,stepSec:3600,numericValue:{values:Array(24).fill(18),unit:'°C'}}},
  low:{numericValue:{value:10,unit:'°C'}},high:{numericValue:{value:20,unit:'°C'}},utc_offset:{numericValue:{value:0}},
  precipitation:{numericValue:{value:25,unit:'%'}}
}}]});
const weather=f.sent.at(-1);
assert.equal(weather.FORECAST_DATA.length,48);
assert.equal(weather.WEATHER_TEMP_MIN,10);
assert(size(weather)<=256);
fire('showConfiguration');
f.timers.clear();
const previousSends=f.sent.length;
const resumed=launch();
assert.equal(f.sent.length,previousSends+1);
assert.equal(JSON.stringify(f.sent.at(-1)),JSON.stringify(weather));
const count=subscriptions.length;
for(let i=0;i<10;i++)resumed('appmessage',{payload:{[keys.WEATHER_REQUEST]:1}});
assert.equal(subscriptions.length,count);
assert.equal(JSON.stringify(f.sent.at(-1)),JSON.stringify(weather));
console.log('Compiled bundle passed: settings migration, stable message IDs, message sizes, cache replay, and reconnect subscriptions.');
