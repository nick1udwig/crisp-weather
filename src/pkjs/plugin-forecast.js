function number(value) { return typeof value === 'number' && isFinite(value); }
function timestamp(value) { return number(value) && value > 0 && value <= 2147483647 && value % 1 === 0; }
function numeric(property) { return property && property.numericValue; }
function temperature(value,unit) {
  if (!number(value) || (unit !== '°C' && unit !== '°F')) return null;
  var celsius = unit === '°F' ? (value-32)*5/9 : value;
  return celsius >= -100 && celsius <= 100 ? Math.round(celsius) : null;
}
function series(properties,name) { return properties[name] && properties[name].series; }
function at(series,shape,time) {
  if (!series || !timestamp(series.start) || !number(series.stepSec) || series.stepSec <= 0) return null;
  var values = series[shape] && series[shape].values, index = Math.floor((time-series.start)/series.stepSec);
  return Array.isArray(values) && index >= 0 && index < values.length ? values[index] : null;
}
function codeAt(series,time) { return at(series,'shortText',time) || at(series,'longText',time); }
function isNight(properties,time) {
  var rise = at(series(properties,'daily_sunrise'),'timestamp',time);
  var set = at(series(properties,'daily_sunset'),'timestamp',time);
  if (!timestamp(rise) || !timestamp(set)) {
    rise = properties.sunrise && properties.sunrise.timestamp && properties.sunrise.timestamp.value;
    set = properties.sunset && properties.sunset.timestamp && properties.sunset.timestamp.value;
    var offset = numeric(properties.utc_offset), seconds = offset && number(offset.value) ? offset.value*60 : 0;
    if (!timestamp(rise) || !timestamp(set) || Math.floor((rise+seconds)/86400) !== Math.floor((time+seconds)/86400)) return false;
  }
  return time < rise || time >= set;
}
function icon(code,night) {
  if (code === 'sun' || code === 'clear') return night ? 1 : 0;
  if (code === 'partly_cloudy' || code === 'cloudy') return 2;
  if (code === 'fog') return 3;
  if (code === 'light_rain' || code === 'heavy_rain' || code === 'rain_and_snow') return 4;
  if (code === 'light_snow' || code === 'heavy_snow') return 5;
  if (code === 'thunderstorm') return 6;
  return 7;
}
function parse(envelope,instanceId,now) {
  var list = envelope && Array.isArray(envelope.instances) ? envelope.instances : [];
  var location = instanceId ? list.filter(function(item) { return item.instanceId === instanceId; })[0] : list[0];
  var p = location && location.properties || {}, payload = {WEATHER_RESET:1};
  var expiry = envelope && envelope.validUntilMs;
  var until = number(expiry) ? Math.floor(expiry/1000) : now+1800;
  until = Math.min(until,now+10800,2147483647);
  if (!timestamp(now) || until <= now || !location) return payload;
  payload.WEATHER_VALID_UNTIL = until;
  var temps = series(p,'hourly_temperature'), start;
  if (temps && timestamp(temps.start) && temps.stepSec === 3600 && now >= temps.start) {
    start = temps.start + Math.floor((now-temps.start)/3600)*3600;
    var bytes = [], usable = false;
    for (var i=0;i<24;i++) {
      var time = start + i*3600;
      var value = temperature(at(temps,'numericValue',time), temps.numericValue && temps.numericValue.unit);
      bytes.push(value === null ? 255 : value+100, icon(codeAt(series(p,'hourly_condition_code'),time),isNight(p,time)));
      if (value !== null) usable = true;
    }
    if (usable) {
      payload.FORECAST_START = start;
      payload.FORECAST_DATA = bytes;
      payload.WEATHER_FETCHED_AT = now;
    }
  }
  var highs = series(p,'daily_high'), lows = series(p,'daily_low');
  var high = temperature(at(highs,'numericValue',now),highs && highs.numericValue && highs.numericValue.unit);
  var low = temperature(at(lows,'numericValue',now),lows && lows.numericValue && lows.numericValue.unit);
  var dayEnd;
  if (high !== null && low !== null && highs.stepSec === 86400 && lows.stepSec === 86400 && highs.start === lows.start) {
    dayEnd = highs.start + (Math.floor((now-highs.start)/86400)+1)*86400;
  } else {
    var h = numeric(p.high), l = numeric(p.low), offset = numeric(p.utc_offset);
    high = h ? temperature(h.value,h.unit) : null;
    low = l ? temperature(l.value,l.unit) : null;
    if (offset && number(offset.value) && Math.abs(offset.value) <= 14*60) {
      dayEnd = (Math.floor((now+offset.value*60)/86400)+1)*86400-offset.value*60;
    }
  }
  if (high !== null && low !== null && low <= high && timestamp(dayEnd)) {
    payload.WEATHER_TEMP_MIN = low;
    payload.WEATHER_TEMP_MAX = high;
    payload.WEATHER_DAILY_UNTIL = dayEnd;
  }
  var rain = numeric(p.precipitation);
  if (rain && rain.unit === '%' && number(rain.value) && rain.value >= 0 && rain.value <= 100) {
    payload.WEATHER_PRECIP = Math.round(rain.value);
    payload.WEATHER_RAIN_UNTIL = (start || Math.floor(now/3600)*3600)+3600;
  }
  return payload;
}
module.exports = {parse:parse, icon:icon};
