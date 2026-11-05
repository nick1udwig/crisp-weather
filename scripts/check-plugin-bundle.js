const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const {runtime}=require('../tests/helpers/weather');
const f=runtime(), events={}, subscriptions=[];
const keys=JSON.parse(fs.readFileSync('build/js/message_keys.json','utf8'));
const binding=JSON.stringify({category:'phone',item:'phone_state',property:'battery_level'});
f.env.storage.setItem('clay-settings',JSON.stringify({CORNER_TL:binding,CORNER_TL_INSTANCE:'other'}));
let html;
class ClockDate extends Date { static now(){return f.env.now();} }
vm.runInNewContext(fs.readFileSync('build/pebble-js-app.js','utf8'),{
  localStorage:f.env.storage,Date:ClockDate,Math,setTimeout:f.env.setTimeout,clearTimeout:f.env.clearTimeout,
  console:{log:f.env.log,error:f.env.log},
  Pebble:{addEventListener:(name,fn)=>{(events[name] ||= []).push(fn);},getActiveWatchInfo:()=>({platform:'emery',firmware:{major:4,minor:9,patch:0}}),
    getAccountToken:()=>'',getWatchToken:()=>'',sendAppMessage:f.env.send,
    openURL:url=>{html=decodeURIComponent(url.slice(url.indexOf(',')+1));},
    enumeratePlugins:()=>[{sources:[{category:'phone',items:['phone_state'],properties:{battery_level:['numericValue']}}]}],
    subscribeToSource:request=>{const subscription={request,closed:false,unsubscribe(){this.closed=true;}};subscriptions.push(subscription);return subscription;}}
});
function fire(name,event){events[name].forEach(fn=>fn(event));}
fire('ready');
const phone=subscriptions.find(s=>s.request.category==='phone');
phone.request.onData({validUntilMs:f.env.now()+60000,instances:[{instanceId:'first',properties:{battery_level:{numericValue:{value:1}}}},
  {instanceId:'other',properties:{name:{shortText:{text:'Second phone'}},battery_level:{numericValue:{value:75,unit:'%'}}}}]});
assert.equal(f.sent.at(-1).CORNER_TEXT,'75%');
const weather=subscriptions.find(s=>s.request.category==='weather');
const start=Math.floor(f.env.now()/3600000)*3600;
weather.request.onData({validUntilMs:f.env.now()+60000,instances:[{instanceId:'home',properties:{
  hourly_temperature:{series:{start,stepSec:3600,numericValue:{values:Array(24).fill(68),unit:'°F'}}},
  hourly_condition_code:{series:{start,stepSec:3600,longText:{values:Array(24).fill('cloudy')}}}
}}]});
const forecast=f.sent.at(-1);
assert.equal(forecast.FORECAST_DATA[0],120);assert.equal(forecast.FORECAST_DATA[1],2);
assert.equal(forecast.WEATHER_RESET,1);assert.equal(forecast.WEATHER_VALID_UNTIL,Math.floor(f.env.now()/1000)+60);
assert(!fs.readFileSync('build/pebble-js-app.js','utf8').includes('api.open-meteo.com'));
assert(!JSON.parse(fs.readFileSync('build/appinfo.json','utf8')).usesPermissions.some(p=>p.name==='Internet'));

fire('showConfiguration');assert(html.includes('phone_state'));
fire('webviewclosed',{response:JSON.stringify({CORNER_TL:{value:binding},CORNER_TL_INSTANCE:{value:'other'}})});
const settings=f.sent.find(message=>message[keys.CORNER_TL] === '7');assert(settings);
assert.equal(Object.keys(settings).length,1);
assert.equal(JSON.parse(f.values['clay-settings']).CORNER_TL,binding);
assert.equal(JSON.parse(fs.readFileSync('build/appinfo.json','utf8')).manifestVersion,2);
for(const message of f.sent) {
  const size=1+Object.values(message).reduce((n,v)=>n+7+(typeof v==='string'?Buffer.byteLength(v)+1:Array.isArray(v)?v.length:4),0);
  assert(size<=256);
}
if(process.env.CRISP_SETTINGS_HTML) fs.writeFileSync(process.env.CRISP_SETTINGS_HTML,html);
console.log('Plugin bundle passed: Clay selection, stable instance, weather conversion, permissions, no direct HTTP, and message size.');
