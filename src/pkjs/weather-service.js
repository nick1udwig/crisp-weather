var forecast = require('./forecast');
var cacheFactory = require('./weather-cache');
var schedulerFactory = require('./weather-scheduler');
var LOCATION_KEY = 'crisp-weather-location-v1';
function coordinate(value, bound) {
  return value !== null && value !== undefined && String(value).trim() !== '' &&
    isFinite(Number(value)) && Math.abs(Number(value)) <= bound;
}
function coordinates(pos) {
  return pos && pos.coords && coordinate(pos.coords.latitude,90) && coordinate(pos.coords.longitude,180);
}
function create(env) {
  var cache = cacheFactory.create(env.storage);
  var scheduler = schedulerFactory.create(env.storage, env.now, env.random);
  var busy = false, timer = null, watchdog = null, generation = 0, activeXHR = null;
  var deliveryBusy = false, deliveryTimer = null, deliveryAttempt = 0;
  var delivered = '', sending = '', deliveryBlocked = false, location = {};
  try { location = JSON.parse(env.storage.getItem(LOCATION_KEY)) || {}; } catch (e) {}
  if (!location || typeof location !== 'object' || Array.isArray(location)) location = {};
  function saveLocation() {
    try { env.storage.setItem(LOCATION_KEY, JSON.stringify(location)); } catch (e) {}
  }
  function record(message) { location.message = message; saveLocation(); env.log(message); }
  function schedule() {
    if (timer !== null) env.clearTimeout(timer);
    timer = env.setTimeout(check, Math.max(1000, Math.min(86400000, scheduler.wait())));
  }
  function sendCached(force) {
    if (deliveryBusy || deliveryTimer !== null) return;
    var payload = cache.get(Math.floor(env.now() / 1000));
    if (!payload) return;
    var signature = JSON.stringify(payload);
    if (signature !== sending) { sending = signature; deliveryAttempt = 0; deliveryBlocked = false; }
    if (deliveryBlocked || (!force && signature === delivered)) return;
    deliveryBusy = true;
    var settled = false;
    var timeout = env.setTimeout(function() { failure({error:'Delivery timed out'}); },10000);
    function finish() {
      if (settled) return false;
      settled = true; deliveryBusy = false; env.clearTimeout(timeout);
      return true;
    }
    function success() {
      if (!finish()) return;
      delivered = signature; deliveryAttempt = 0;
      sendCached();
    }
    function failure(e) {
      if (!finish()) return;
      record('Weather send failed: ' + JSON.stringify(e));
      if (deliveryAttempt >= 3) { deliveryBlocked = true; return; }
      deliveryTimer = env.setTimeout(function() { deliveryTimer = null; sendCached(true); },[5000,15000,60000][deliveryAttempt++]);
    }
    try { env.send(payload,success,failure); } catch (e) { failure({error:String(e)}); }
  }
  function check() {
    if (busy) return;
    sendCached();
    if (scheduler.wait() > 0) { schedule(); return; }
    busy = true;
    var token = ++generation, stage = 'location';
    function current() { return token === generation && busy; }
    function finish(kind, message, retryAfter) {
      if (!current()) return;
      busy = false;
      if (watchdog !== null) { env.clearTimeout(watchdog); watchdog = null; }
      var request = activeXHR; activeXHR = null;
      if (kind === 'success') scheduler.success(); else scheduler.failure(kind,retryAfter);
      if (message) record(message);
      if (kind !== 'success' && request) { try { request.abort(); } catch (e) {} }
      schedule();
    }
    function located(pos, saved) {
      if (!current() || stage !== 'location') return;
      if (!coordinates(pos)) { finish('location','Location unavailable: invalid coordinates'); return; }
      stage = 'http';
      if (watchdog !== null) env.clearTimeout(watchdog);
      if (!saved) { location.fix = {coords:{latitude:Number(pos.coords.latitude),longitude:Number(pos.coords.longitude)},at:env.now()}; saveLocation(); }
      if (!scheduler.reserve()) { finish('storage','Weather request blocked by request budget or storage'); return; }
      var xhr;
      try {
        xhr = new env.XMLHttpRequest(); activeXHR = xhr;
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + Number(pos.coords.latitude) +
          '&longitude=' + Number(pos.coords.longitude) +
          '&hourly=precipitation_probability,temperature_2m,weather_code,is_day' +
          '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&timeformat=unixtime&forecast_days=2';
        xhr.open('GET', url);
        xhr.timeout = 20000;
        watchdog = env.setTimeout(function() { finish('transient','Weather request timed out'); },21000);
        xhr.onload = function() {
          if (!current()) return;
          if (xhr.status === 429) {
            var header = null, delay;
            try { header = xhr.getResponseHeader('Retry-After'); } catch (e) {}
            if (header && /^\s*\d+\s*$/.test(header)) delay = Number(header) * 1000;
            else if (header) { var date = Date.parse(header); if (isFinite(date)) delay = Math.max(0,date-env.now()); }
            finish('rate','Weather HTTP 429: cooling down',delay); return;
          }
          if (xhr.status !== 200) {
            finish(xhr.status === 0 || xhr.status >= 500 ? 'transient' : 'http','Weather HTTP ' + xhr.status); return;
          }
          try {
            var payload = forecast.parse(JSON.parse(xhr.responseText),Math.floor(env.now()/1000));
            cache.put(payload);
            finish('success','Weather received');
            sendCached();
          } catch (e) { finish('parse','Weather parse error: ' + e); }
        };
        xhr.onerror = function() { finish('transient','Weather request failed'); };
        xhr.ontimeout = function() { finish('transient','Weather request timed out'); };
        xhr.send();
      } catch (e) { finish('transient','Weather request error: ' + e); }
    }
    function locationError(e) {
      if (!current() || stage !== 'location') return;
      if (e.code === 1) { finish('permission','Location permission denied. Enable access or set manual coordinates.'); return; }
      var fix = location.fix;
      if (coordinates(fix) && env.now() >= fix.at && env.now()-fix.at <= 6*3600000) {
        record('Location unavailable: using saved location'); located(fix,true);
      } else finish('location','Location unavailable: ' + e.message);
    }
    if (location.mode === '1') {
      if (!coordinate(location.latitude,90) || !coordinate(location.longitude,180)) {
        finish('permission','Manual location invalid. Set latitude (-90 to 90) and longitude (-180 to 180).'); return;
      }
      located({coords:{latitude:Number(location.latitude),longitude:Number(location.longitude)}},true);
    } else {
      watchdog = env.setTimeout(function() { locationError({code:3,message:'Timed out'}); },16000);
      try {
        env.geolocation.getCurrentPosition(function(pos) { located(pos,false); },locationError,
          {timeout:15000,maximumAge:10*60000});
      } catch (e) { locationError({message:String(e)}); }
    }
  }
  function reconnect() {
    deliveryBlocked = false; deliveryAttempt = 0;
    if (deliveryTimer !== null) { env.clearTimeout(deliveryTimer); deliveryTimer = null; }
    sendCached(true); check();
  }
  function configure(settings) {
    var mode = String(settings.WEATHER_LOCATION_MODE || '0');
    var latitude = String(settings.WEATHER_LATITUDE === undefined ? '' : settings.WEATHER_LATITUDE), longitude = String(settings.WEATHER_LONGITUDE === undefined ? '' : settings.WEATHER_LONGITUDE);
    var changed = mode !== (location.mode || '0') || latitude !== (location.latitude || '') || longitude !== (location.longitude || '');
    location.mode = mode; location.latitude = latitude; location.longitude = longitude;
    saveLocation();
    if (changed) {
      generation++; busy = false;
      if (watchdog !== null) env.clearTimeout(watchdog);
      if (activeXHR) { try { activeXHR.abort(); } catch (e) {} activeXHR = null; }
      cache.clear(); delivered = ''; sending = '';
    }
    check();
  }
  function status() { return {message:location.message || 'Waiting for weather', schedule:scheduler.status()}; }
  return {start:check, check:check, reconnect:reconnect, configure:configure, status:status};
}
module.exports = {create:create};
