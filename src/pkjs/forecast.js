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
function parse(data, now) {
  var h = data.hourly, i = -1, bytes = [];
  if (!h || !data.daily) throw new Error('Missing forecast');
  for (var j = 0; j < h.time.length; j++) {
    if (h.time[j] <= now && now < h.time[j] + 3600) i = j;
  }
  if (i < 0 || i + 24 > h.time.length) throw new Error('Incomplete forecast horizon');
  for (j = i; j < i + 24; j++) {
    if (h.time[j] !== h.time[i] + (j-i)*3600 || !number(h.temperature_2m[j]) ||
        !number(h.weather_code[j]) || (h.is_day[j] !== 0 && h.is_day[j] !== 1)) {
      throw new Error('Invalid hourly sample');
    }
    var t = Math.round(h.temperature_2m[j]);
    if (t < -100 || t > 100) throw new Error('Temperature out of range');
    bytes.push(t + 100, icon(h.weather_code[j], h.is_day[j]));
  }
  var lo = data.daily.temperature_2m_min[0], hi = data.daily.temperature_2m_max[0];
  var rain = h.precipitation_probability[i];
  if (!number(lo) || !number(hi) || !number(rain)) throw new Error('Invalid daily sample');
  return {FORECAST_START:h.time[i], FORECAST_DATA:bytes,
    WEATHER_TEMP_MIN:Math.round(lo), WEATHER_TEMP_MAX:Math.round(hi), WEATHER_PRECIP:Math.round(rain)};
}
module.exports = {parse:parse, icon:icon};
