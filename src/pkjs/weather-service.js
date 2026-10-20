var forecast = require('./forecast');
var cacheFactory = require('./weather-cache');
var schedulerFactory = require('./weather-scheduler');
var REFRESH = 30 * 60000;
function create(env) {
  var cache = cacheFactory.create(env.storage);
  var scheduler = schedulerFactory.create(env.storage, env.now);
  var busy = false, timer = null, generation = 0;
  function schedule() {
    if (timer !== null) env.clearTimeout(timer);
    timer = env.setTimeout(check, Math.max(1000, scheduler.wait()));
  }
  function sendCached() {
    var payload = cache.get(Math.floor(env.now() / 1000));
    if (payload) env.send(payload, function() {}, function(e) { env.log('Weather send failed: ' + JSON.stringify(e)); });
  }
  function check() {
    if (busy) return;
    sendCached();
    if (scheduler.wait() > 0) { schedule(); return; }
    busy = true;
    var token = ++generation;
    function finish(success, error) {
      if (token !== generation || !busy) return;
      busy = false;
      if (error) env.log(error);
      if (success) scheduler.success(); else scheduler.defer(REFRESH);
      schedule();
    }
    function located(pos) {
      if (token !== generation || !busy) return;
      if (!scheduler.reserve()) { finish(false, 'Weather request blocked by request budget or storage'); return; }
      var xhr;
      try {
        xhr = new env.XMLHttpRequest();
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pos.coords.latitude +
          '&longitude=' + pos.coords.longitude +
          '&hourly=precipitation_probability,temperature_2m,weather_code,is_day' +
          '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&timeformat=unixtime&forecast_days=2';
        xhr.open('GET', url);
        xhr.timeout = 20000;
        xhr.onload = function() {
          if (token !== generation || !busy) return;
          if (xhr.status !== 200) { finish(false, 'Weather HTTP ' + xhr.status); return; }
          try {
            var payload = forecast.parse(JSON.parse(xhr.responseText), Math.floor(env.now() / 1000));
            cache.put(payload);
            sendCached();
            finish(true);
          } catch (e) { finish(false, 'Weather parse error: ' + e); }
        };
        xhr.onerror = function() { finish(false, 'Weather request failed'); };
        xhr.ontimeout = function() { finish(false, 'Weather request timed out'); };
        xhr.send();
      } catch (e) { finish(false, 'Weather request error: ' + e); }
    }
    try {
      env.geolocation.getCurrentPosition(located,
        function(e) { finish(false, 'Geolocation error: ' + e.message); },
        {timeout:15000, maximumAge:10*60000});
    } catch (e) { finish(false, 'Geolocation error: ' + e); }
  }
  return {start:check, check:check};
}
module.exports = {create:create};
