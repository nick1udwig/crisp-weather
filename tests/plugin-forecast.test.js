const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../src/pkjs/plugin-forecast');
const DAY=1700006400;
function envelope(properties={},validUntilMs=(DAY+14*3600)*1000){
  return {pluginUuid:'test',validUntilMs,instances:[{instanceId:'home',properties:{
    hourly_temperature:{series:{start:DAY,stepSec:3600,numericValue:{values:Array(48).fill(68),unit:'°F'}}},
    hourly_condition_code:{series:{start:DAY,stepSec:3600,longText:{values:Array(48).fill('sun')}}},
    daily_low:{series:{start:DAY,stepSec:86400,numericValue:{values:[32,50],unit:'°F'}}},
    daily_high:{series:{start:DAY,stepSec:86400,numericValue:{values:[68,86],unit:'°F'}}},
    daily_sunrise:{series:{start:DAY,stepSec:86400,timestamp:{values:[DAY+6*3600,DAY+30*3600]}}},
    daily_sunset:{series:{start:DAY,stepSec:86400,timestamp:{values:[DAY+18*3600,DAY+42*3600]}}},
    precipitation:{numericValue:{value:25,unit:'%'}},...properties
  }}]};
}
test('plugin forecasts use the current series hour and normalize Fahrenheit',()=>{
  const payload=parse(envelope(),'home',DAY+12*3600+100);
  assert.equal(payload.FORECAST_START,DAY+12*3600);
  assert.equal(payload.FORECAST_DATA.length,48);
  assert.equal(payload.FORECAST_DATA[0],120);
  assert.equal(payload.WEATHER_TEMP_MIN,0);assert.equal(payload.WEATHER_TEMP_MAX,20);
  assert.equal(payload.WEATHER_DAILY_UNTIL,DAY+86400);
  assert.equal(payload.WEATHER_PRECIP,25);assert.equal(payload.WEATHER_RAIN_UNTIL,DAY+13*3600);
  assert.equal(payload.WEATHER_VALID_UNTIL,DAY+14*3600);
  assert.equal(payload.FORECAST_DATA[1],0);assert.equal(payload.FORECAST_DATA[13],1);
});
test('null samples and unknown conditions stay missing without shifting later hours',()=>{
  const data=envelope(),p=data.instances[0].properties;
  p.hourly_temperature.series.numericValue.values[12]=null;
  p.hourly_condition_code.series.longText.values[13]='unrecognized';
  const payload=parse(data,'home',DAY+12*3600);
  assert.equal(payload.FORECAST_DATA[0],255);assert.equal(payload.FORECAST_DATA[2],120);assert.equal(payload.FORECAST_DATA[3],7);
});
test('missing location or expired envelope clears all weather',()=>{
  assert.deepEqual(parse(envelope(),'removed',DAY+12*3600),{WEATHER_RESET:1});
  assert.deepEqual(parse(envelope({},(DAY+12*3600)*1000),'home',DAY+12*3600),{WEATHER_RESET:1});
});
test('partial data can supply daily and rain readouts without a dial',()=>{
  const payload=parse(envelope({hourly_temperature:null}),'',DAY+12*3600);
  assert.equal(payload.FORECAST_DATA,undefined);assert.equal(payload.WEATHER_TEMP_MAX,20);assert.equal(payload.WEATHER_PRECIP,25);
});
test('scalar daily values need a known local day and rain needs percent units',()=>{
  const data=envelope({daily_low:null,daily_high:null,low:{numericValue:{value:-5,unit:'°C'}},high:{numericValue:{value:10,unit:'°C'}},
    utc_offset:{numericValue:{value:330}},precipitation:{numericValue:{value:1,unit:'mm'}}});
  const now=DAY+12*3600,payload=parse(data,'',now);
  assert.equal(payload.WEATHER_TEMP_MIN,-5);
  assert.equal(payload.WEATHER_DAILY_UNTIL,(Math.floor((now+19800)/86400)+1)*86400-19800);
  assert.equal(payload.WEATHER_PRECIP,undefined);
});
test('unknown units and malformed axes cannot fabricate temperatures',()=>{
  const data=envelope(), p=data.instances[0].properties;
  p.hourly_temperature.series.numericValue.unit='K';
  assert.equal(parse(data,'',DAY+12*3600).FORECAST_DATA,undefined);
  p.hourly_temperature.series.numericValue.unit='°C';p.hourly_temperature.series.stepSec=0;
  assert.equal(parse(data,'',DAY+12*3600).FORECAST_DATA,undefined);
});
test('next local day selects its own low and high and expiry remains bounded',()=>{
  const now=DAY+25*3600, payload=parse(envelope({},(now+24*3600)*1000),'home',now);
  assert.equal(payload.WEATHER_TEMP_MIN,10);assert.equal(payload.WEATHER_TEMP_MAX,30);
  assert.equal(payload.WEATHER_DAILY_UNTIL,DAY+2*86400);assert.equal(payload.WEATHER_VALID_UNTIL,now+10800);
});
module.exports={envelope,DAY};
