const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {runtime}=require('./helpers/weather');
test('settings retain manual location on the phone and send only watch settings',()=>{
  const f=runtime(), events={};
  class Clay {
    constructor(){this.meta={userData:{}};}
    getSettings(response,convert){assert.equal(convert,false);return JSON.parse(response);}
    static prepareSettingsForAppMessage(settings){return Object.fromEntries(Object.entries(settings).map(([key,v])=>[key,v.value]));}
  }
  vm.runInNewContext(fs.readFileSync('src/pkjs/index.js','utf8'),{
    require:name=>name==='@rebble/clay'?Clay:name==='message_keys'?{WEATHER_REQUEST:10034}:require('../src/pkjs/'+name.slice(2)),
    localStorage:f.env.storage,Date:{now:f.env.now},Math:{random:()=>0},
    setTimeout:f.env.setTimeout,clearTimeout:f.env.clearTimeout,
    navigator:{geolocation:f.env.geolocation},XMLHttpRequest:f.env.XMLHttpRequest,
    console:{log:f.env.log},Pebble:{addEventListener:(name,fn)=>{events[name]=fn;},sendAppMessage:f.env.send}
  });
  events.webviewclosed({response:JSON.stringify({THEME:{value:'1'},WEATHER_LOCATION_MODE:{value:'1'},
    WEATHER_LATITUDE:{value:'0'},WEATHER_LONGITUDE:{value:'0'}})});
  assert.equal(f.requests.length,1);assert.equal(f.locations.length,0);
  assert.deepEqual(f.sent,[{THEME:'1'}]);
});
test('phone timers do not receive the weather service as their native receiver',()=>{
  const f=runtime(), events={};
  class Clay { constructor(){this.meta={userData:{}};} }
  function setTimer(callback,delay){
    assert.notEqual(this && this.storage,f.env.storage,'Illegal invocation of setTimeout');
    return f.env.setTimeout(callback,delay);
  }
  function clearTimer(handle){
    assert.notEqual(this && this.storage,f.env.storage,'Illegal invocation of clearTimeout');
    return f.env.clearTimeout(handle);
  }
  vm.runInNewContext(fs.readFileSync('src/pkjs/index.js','utf8'),{
    require:name=>name==='@rebble/clay'?Clay:name==='message_keys'?{WEATHER_REQUEST:10034}:require('../src/pkjs/'+name.slice(2)),
    localStorage:f.env.storage,Date:{now:f.env.now},Math:{random:()=>0},
    setTimeout:setTimer,clearTimeout:clearTimer,navigator:{geolocation:f.env.geolocation},
    XMLHttpRequest:f.env.XMLHttpRequest,console:{log:f.env.log},
    Pebble:{addEventListener:(name,fn)=>{events[name]=fn;},sendAppMessage:f.env.send}
  });
  events.ready();assert.equal(f.locations.length,1);
  f.locate();f.respond();assert.equal(f.sent.length,1);
  f.advance(30*60000);assert.equal(f.locations.length,2);
});
