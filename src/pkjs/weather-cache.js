var KEY = 'crisp-weather-cache-v1';
function numeric(n) { return typeof n === 'number' && isFinite(n); }
function copy(target, source, keys) {
  keys.forEach(function(key) { target[key] = source[key]; });
}
var DIAL = ['FORECAST_START', 'FORECAST_DATA', 'WEATHER_FETCHED_AT'];
var DAILY = ['WEATHER_TEMP_MIN', 'WEATHER_TEMP_MAX', 'WEATHER_DAILY_UNTIL'];
var RAIN = ['WEATHER_PRECIP', 'WEATHER_RAIN_UNTIL'];
function create(storage) {
  var state = {};
  try { state = JSON.parse(storage.getItem(KEY)) || {}; } catch (e) {}
  if (!state || typeof state !== 'object') state = {};
  function put(payload) {
    if (payload.FORECAST_DATA) { state.dial = {}; copy(state.dial, payload, DIAL); }
    if (payload.WEATHER_DAILY_UNTIL) { state.daily = {}; copy(state.daily, payload, DAILY); }
    if (payload.WEATHER_RAIN_UNTIL) { state.rain = {}; copy(state.rain, payload, RAIN); }
    try { storage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function get(now) {
    var result = {}, d = state.dial, day = state.daily, rain = state.rain;
    if (d && numeric(d.WEATHER_FETCHED_AT) && now >= d.WEATHER_FETCHED_AT - 300 &&
        now < d.WEATHER_FETCHED_AT + 10800 && numeric(d.FORECAST_START) &&
        now >= d.FORECAST_START && now < d.FORECAST_START + 86400 &&
        Array.isArray(d.FORECAST_DATA) && d.FORECAST_DATA.length === 48 &&
        d.FORECAST_DATA.every(function(v, i) {
          return numeric(v) && v === Math.floor(v) && (i % 2 ? v >= 0 && v <= 7 : (v >= 0 && v <= 200) || v === 255);
        })) copy(result, d, DIAL);
    if (day && numeric(day.WEATHER_DAILY_UNTIL) && now >= day.WEATHER_DAILY_UNTIL - 86400 &&
        now < day.WEATHER_DAILY_UNTIL && numeric(day.WEATHER_TEMP_MIN) && numeric(day.WEATHER_TEMP_MAX) &&
        day.WEATHER_TEMP_MIN >= -100 && day.WEATHER_TEMP_MAX <= 100 &&
        day.WEATHER_TEMP_MIN <= day.WEATHER_TEMP_MAX) copy(result, day, DAILY);
    if (rain && numeric(rain.WEATHER_RAIN_UNTIL) && now >= rain.WEATHER_RAIN_UNTIL - 3600 &&
        now < rain.WEATHER_RAIN_UNTIL && numeric(rain.WEATHER_PRECIP) &&
        rain.WEATHER_PRECIP >= 0 && rain.WEATHER_PRECIP <= 100) copy(result, rain, RAIN);
    return Object.keys(result).length ? result : null;
  }
  return {put:put, get:get};
}
module.exports = {create:create};
