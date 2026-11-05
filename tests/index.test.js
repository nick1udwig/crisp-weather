const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {runtime}=require('./helpers/weather');
const keys=require('../package.json').pebble.messageKeys;
function launch(f,timers={}) {
  const events={},requests=[],sources=require('../src/pkjs/plugin-sources');
  class Clay {
    constructor(){this.meta={userData:{}};}
    getSettings(response,convert){assert.equal(convert,false);return JSON.parse(response);}
    static prepareSettingsForAppMessage(settings){return Object.fromEntries(Object.entries(settings).map(([key,v])=>[key,v.value]));}
  }
  vm.runInNewContext(fs.readFileSync('src/pkjs/index.js','utf8'),{
    require(name) {
      if(name==='@rebble/clay') return Clay;
      if(name==='message_keys') return keys;
      if(name==='./plugin-sources') return {...sources,create:pebble=>sources.create(pebble,f.env.now)};
      return require('../src/pkjs/'+name.slice(2));
    },
    localStorage:f.env.storage,Date:{now:f.env.now},
    setTimeout:timers.setTimeout||f.env.setTimeout,clearTimeout:timers.clearTimeout||f.env.clearTimeout,
    console:{log:f.env.log},Pebble:{addEventListener:(name,fn)=>{events[name]=fn;},sendAppMessage:f.env.send,
      subscribeToSource:request=>{requests.push(request);return {unsubscribe(){}};}}
  });
  return {events,requests};
}
test('settings select the plugin location and send only known watch settings',()=>{
  const f=runtime(),{events,requests}=launch(f);
  events.ready();
  events.webviewclosed({response:JSON.stringify({THEME:{value:'1'},WEATHER_PLUGIN_INSTANCE:{value:'home'},
    WEATHER_PROVIDER:{value:'open-meteo'},WEATHER_LOCATION_MODE:{value:'1'},WEATHER_LATITUDE:{value:'0'},WEATHER_LONGITUDE:{value:'0'}})});
  assert.deepEqual(f.sent.at(-1),{THEME:'1'});
  const start=Math.floor(f.env.now()/3600000)*3600;
  requests.at(-1).onData({instances:[{instanceId:'elsewhere',properties:{}},{instanceId:'home',properties:{
    hourly_temperature:{series:{start,stepSec:3600,numericValue:{values:[18],unit:'°C'}}}
  }}]});
  assert.equal(f.sent.at(-1).FORECAST_DATA[0],118);
});
test('phone timers use the native receiver during delivery retries and preview timeouts',()=>{
  const f=runtime();
  function setTimer(callback,delay){
    assert.notEqual(this && this.storage,f.env.storage,'Illegal invocation of setTimeout');
    return f.env.setTimeout(callback,delay);
  }
  function clearTimer(handle){
    assert.notEqual(this && this.storage,f.env.storage,'Illegal invocation of clearTimeout');
    return f.env.clearTimeout(handle);
  }
  const {events}=launch(f,{setTimeout:setTimer,clearTimeout:clearTimer});
  f.env.deliveryError=true;events.ready();assert.equal(f.sent.length,1);
  f.env.deliveryError=false;f.advance(1000);assert.equal(f.sent.length,2);
  const replies=[];
  events.configmessage({data:{source:JSON.stringify({category:'weather',item:'location',property:'temperature'})},respond:reply=>replies.push(reply)});
  f.advance(8000);assert.equal(replies.length,1);assert.equal(replies[0].error,'Waiting for plugin data. Retrying…');assert.equal(replies[0].retry,true);
});
test('weather settings recover from a timeout when the shared source delivers later',()=>{
  const f=runtime(),{events,requests}=launch(f),replies=[];
  events.ready();
  const query=()=>events.configmessage({data:{source:JSON.stringify({category:'weather',item:'location',property:'temperature'})},respond:reply=>replies.push(reply)});
  query();f.advance(8000);assert.equal(replies[0].retry,true);
  requests[0].onData({instances:[{instanceId:'home',properties:{name:{shortText:{text:'Home'}},temperature:{numericValue:{value:18,unit:'°C'}}}}]});
  query();assert.equal(requests.length,1);assert.equal(replies.length,2);
  assert.equal(replies[1].instances[0].value,'home');assert.equal(replies[1].instances[0].preview,'18°C');
  f.advance(8000);assert.equal(replies.length,2);
});
test('weather settings show an earlier permission error and recover when permission is granted',()=>{
  const f=runtime(),{events,requests}=launch(f),replies=[];
  events.ready();requests[0].onError({code:'PERMISSION_DENIED'});
  const query=()=>events.configmessage({data:{source:JSON.stringify({category:'weather',item:'location',property:'temperature'})},respond:reply=>replies.push(reply)});
  query();assert.equal(replies[0].error,'Allow Location for Crisp Weather in the Pebble app.');
  assert.equal(replies[0].retry,true);f.advance(8000);assert.equal(replies.length,1);
  requests[0].onData({instances:[{instanceId:'home',properties:{temperature:{numericValue:{value:20,unit:'°C'}}}}]});
  query();assert.equal(requests.length,1);assert.equal(replies[1].instances[0].preview,'20°C');
});
