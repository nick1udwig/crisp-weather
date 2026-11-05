var forecast = require('./plugin-forecast');
var STORE_KEY = 'crisp-plugin-weather-v1';
function create(env, instanceId) {
  var subscription, state, signature = '', delivered = '', message = 'Waiting for Pebble weather', stopped = false;
  try {
    var cached = JSON.parse(env.storage.getItem(STORE_KEY));
    if (cached && cached.instanceId === instanceId && typeof cached.received === 'number' && cached.signature) {
      state = {instanceId:instanceId,signature:cached.signature,received:cached.received,
        payload:forecast.parse(JSON.parse(cached.signature),instanceId,cached.received)};
      signature = cached.signature;
    }
  } catch (error) {}
  function save() {
    try { env.storage.setItem(STORE_KEY,JSON.stringify(state || null)); } catch (error) {}
  }
  function send(force) {
    if (stopped) return;
    var now = Math.floor(env.now()/1000), payload = state && state.payload;
    if (!payload || !(payload.WEATHER_VALID_UNTIL > now) || now < state.received-300) payload = {WEATHER_RESET:1};
    var key = JSON.stringify(payload);
    if (!force && key === delivered) return;
    delivered = key;
    env.send(payload,function() {},function() { if (delivered === key) delivered = ''; },'weather');
  }
  function start() {
    if (subscription || stopped) return;
    send(true);
    subscription = env.sources.subscribe({category:'weather',item:'location'},function(envelope) {
      if (stopped) return;
      var next = JSON.stringify(envelope);
      if (signature !== next) {
        var now = Math.floor(env.now()/1000);
        state = {instanceId:instanceId,signature:next,received:now,payload:forecast.parse(envelope,instanceId,now)};
        signature = next; save();
      }
      message = state && state.payload.FORECAST_DATA ? 'Pebble weather received' : 'No hourly forecast from this source';
      send();
    },function(error) {
      if (stopped) return;
      message = 'Pebble weather: ' + (error && error.code || 'PLUGIN_UNAVAILABLE');
      if (error && error.code === 'PERMISSION_DENIED') { state = null; signature = ''; save(); }
      send();
    });
  }
  return {
    start:start,
    check:function() { if (!subscription) start(); else send(); },
    reconnect:function() { send(true); if (!subscription) start(); },
    configure:function() {},
    stop:function() { stopped = true; if (subscription) subscription.unsubscribe(); },
    diagnostics:function() {
      return message + '\nLocation: ' + (instanceId || 'First Pebble weather location') +
        '\nConfigure weather locations and preferred sources in the Pebble app.';
    }
  };
}
module.exports = {create:create};
