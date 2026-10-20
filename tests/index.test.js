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
