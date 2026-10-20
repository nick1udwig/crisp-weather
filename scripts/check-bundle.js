const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {runtime} = require('../tests/helpers/weather');
const config = require('../src/pkjs/config');
const keys = JSON.parse(fs.readFileSync('build/js/message_keys.json','utf8'));
const source = fs.readFileSync('build/pebble-js-app.js','utf8');
const f = runtime();
class ClockDate extends Date { static now() { return f.env.now(); } }
function launch() {
  const events = {};
  vm.runInNewContext(source,{
    localStorage:f.env.storage,Date:ClockDate,Math,encodeURIComponent,decodeURIComponent,
    setTimeout:f.env.setTimeout,clearTimeout:f.env.clearTimeout,
    navigator:{geolocation:f.env.geolocation},XMLHttpRequest:f.env.XMLHttpRequest,
    console:{log:f.env.log,error:f.env.log},
    Pebble:{addEventListener:(name,fn)=>{(events[name] ||= []).push(fn);},
      getActiveWatchInfo:()=>({platform:'emery'}),getAccountToken:()=>'',getWatchToken:()=>'',
      sendAppMessage:f.env.send,openURL:url=>{assert(url.startsWith('data:'));}}
  });
  const fire=(name,event)=>events[name].forEach(fn=>fn(event));
  fire('ready');return fire;
}
const fire=launch();
const settings=Object.fromEntries(config.flatMap(item=>item.items||[item]).filter(item=>item.messageKey)
  .map(item=>[item.messageKey,{value:item.type==='color'?parseInt(item.defaultValue,16):item.defaultValue}]));
fire('webviewclosed',{response:JSON.stringify(settings)});
const outgoing=f.sent[0];
for(const key of ['WEATHER_LOCATION_MODE','WEATHER_LATITUDE','WEATHER_LONGITUDE']) assert.equal(outgoing[keys[key]],undefined);
assert.equal(outgoing[keys.THEME],'0');
function size(message) {
  return 1+Object.values(message).reduce((n,v)=>n+7+(typeof v==='string'?Buffer.byteLength(v)+1:Array.isArray(v)?v.length:4),0);
}
assert(size(outgoing)<=256);
f.locate();
f.respond();
const weather=f.sent.at(-1);
assert.equal(weather.FORECAST_DATA.length,48);
assert.equal(weather.WEATHER_TEMP_MIN,10);
assert(size(weather)<=256);
fire('showConfiguration');
f.timers.clear();
const previousSends=f.sent.length;
const resumed=launch();
assert.equal(f.sent.length,previousSends+1);
assert.equal(f.locations.length,1);
assert.equal(f.requests.length,1);
assert.equal(f.sent.at(-1).WEATHER_FETCHED_AT,weather.WEATHER_FETCHED_AT);
for(let i=0;i<10;i++)resumed('appmessage',{payload:{[keys.WEATHER_REQUEST]:1}});
assert.equal(f.requests.length,1);
console.log('Compiled bundle passed: real Clay settings, message sizes, cache replay, and reconnect request limits.');
