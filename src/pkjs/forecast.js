// Stable visual categories shared with forecast.h. All temperatures travel in C.
function icon(code, day) {
  if (code === 0 || code === 1) return day ? 0 : 1;
  if (code === 2 || code === 3) return 2;
  if (code === 45 || code === 48) return 3;
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].indexOf(code) >= 0) return 4;
  if ([71,73,75,77,85,86].indexOf(code) >= 0) return 5;
  if ([95,96,99].indexOf(code) >= 0) return 6;
  return 7;
}
function number(value) { return typeof value === 'number' && isFinite(value); }
function sample(values, index) { return Array.isArray(values) ? values[index] : undefined; }
function temperature(value) { return number(value) && value >= -100 && value <= 100; }
function parse(data, now) {
  if (!data || typeof data !== 'object') throw new Error('Invalid forecast response');
  var h = data.hourly || {}, daily = data.daily || {}, payload = {};
  var times = Array.isArray(h.time) ? h.time : [], i = -1;
  for (var j = 0; j < times.length; j++) {
    if (number(times[j]) && times[j] <= now && now < times[j] + 3600) i = j;
  }
  if (i >= 0) {
    var bytes = [], usable = false;
    for (j = 0; j < 24; j++) {
      var index = i + j, t = sample(h.temperature_2m, index);
      var valid = times[index] === times[i] + j * 3600 && temperature(t);
      var code = sample(h.weather_code, index), day = sample(h.is_day, index);
      bytes.push(valid ? Math.round(t) + 100 : 255,
        number(code) && (day === 0 || day === 1) ? icon(code, day) : 7);
      usable = usable || valid;
    }
    if (usable) {
      payload.FORECAST_START = times[i];
      payload.WEATHER_FETCHED_AT = now;
      payload.FORECAST_DATA = bytes;
    }
    var rain = sample(h.precipitation_probability, i);
    if (number(rain) && rain >= 0 && rain <= 100) {
      payload.WEATHER_PRECIP = Math.round(rain);
      payload.WEATHER_RAIN_UNTIL = times[i] + 3600;
    }
  }
  var days = Array.isArray(daily.time) ? daily.time : [];
  for (j = 0; j < days.length; j++) {
    var end = number(days[j+1]) ? days[j+1] : days[j] + 86400;
    if (!(number(days[j]) && days[j] <= now && now < end)) continue;
    var lo = sample(daily.temperature_2m_min, j), hi = sample(daily.temperature_2m_max, j);
    if (temperature(lo) && temperature(hi) && lo <= hi) {
      payload.WEATHER_TEMP_MIN = Math.round(lo);
      payload.WEATHER_TEMP_MAX = Math.round(hi);
      payload.WEATHER_DAILY_UNTIL = end;
    }
  }
  if (!Object.keys(payload).length) throw new Error('No usable weather');
  return payload;
}
module.exports = {parse:parse, icon:icon};
