const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runtime}=require('./helpers/weather');
const {run}=require('../src/pkjs/settings-migration');
test('upgrade removes legacy settings and caches while preserving plugin and watch settings',()=>{
  const f=runtime(),obsolete=['crisp-weather-location-v1','crisp-weather-cache-v1','crisp-weather-schedule-v1'];
  const retained={WEATHER_PLUGIN_INSTANCE:'home',CORNER_TL:'auto',THEME:'1'};
  f.env.storage.setItem('clay-settings',JSON.stringify({...retained,WEATHER_PROVIDER:'open-meteo',
    WEATHER_LOCATION_MODE:'1',WEATHER_LATITUDE:'12',WEATHER_LONGITUDE:'34'}));
  obsolete.forEach(key=>f.env.storage.setItem(key,'old'));
  const caches=['crisp-plugin-weather-v1','crisp-plugin-corners-v1','crisp-palette-1','crisp-pending-settings'];
  caches.forEach(key=>f.env.storage.setItem(key,'saved'));
  run(f.env.storage);run(f.env.storage);
  obsolete.forEach(key=>assert.equal(f.env.storage.getItem(key),null));
  caches.forEach(key=>assert.equal(f.env.storage.getItem(key),'saved'));
  assert.deepEqual(JSON.parse(f.values['clay-settings']),retained);
});
test('migration tolerates missing or corrupt settings and unavailable storage',()=>{
  const f=runtime();
  for(const value of [null,'bad','null','[]','1']) {
    f.env.storage.setItem('clay-settings',value);
    assert.doesNotThrow(()=>run(f.env.storage));
  }
  const blocked=()=>{throw new Error('Storage blocked');};
  assert.doesNotThrow(()=>run({getItem:blocked,setItem:blocked,removeItem:blocked}));
  assert.doesNotThrow(()=>run({getItem:()=>'{"WEATHER_PROVIDER":"open-meteo"}',setItem:blocked,removeItem:blocked}));
});
