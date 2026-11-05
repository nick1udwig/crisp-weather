var forecast = require('./plugin-forecast');
var STORE_KEY = 'crisp-plugin-weather-v1';
function create(env, instanceId) {
  var subscription, state, signature = '', delivered = '', message = 'Waiting for Pebble weather', stopped = false, generation = 0;
  if (instanceId === undefined) {
    try { instanceId = (JSON.parse(env.storage.getItem('clay-settings')) || {}).WEATHER_PLUGIN_INSTANCE; } catch (error) {}
  }
  instanceId = typeof instanceId === 'string' ? instanceId : '';
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
    var key = JSON.stringify(payload), current = generation;
    if (!force && key === delivered) return;
    delivered = key;
    env.send(payload,function() {},function() { if (current === generation && delivered === key) delivered = ''; },'weather');
  }
  function start() {
    if (subscription || stopped) return;
    var current = ++generation;
    send(true);
    subscription = env.sources.subscribe({category:'weather',item:'location'},function(envelope,receivedAtMs) {
      if (stopped || current !== generation) return;
      var next = JSON.stringify(envelope);
      var received = typeof receivedAtMs === 'number' && isFinite(receivedAtMs) ? Math.floor(receivedAtMs/1000) : null;
      if (signature !== next || (received !== null && state && received > state.received)) {
        var now = received === null ? Math.floor(env.now()/1000) : received;
        state = {instanceId:instanceId,signature:next,received:now,payload:forecast.parse(envelope,instanceId,now)};
        signature = next; save();
      }
      message = state && state.payload.FORECAST_DATA ? 'Pebble weather received' : 'No hourly forecast from this source';
      send();
    },function(error) {
      if (stopped || current !== generation) return;
      message = 'Pebble weather: ' + (error && error.code || 'PLUGIN_UNAVAILABLE');
      if (error && error.code === 'PERMISSION_DENIED') { state = null; signature = ''; save(); }
      send();
    });
  }
  function retrySubscription() {
    if (stopped) return;
    if (!subscription) start();
    else if (subscription.retry) subscription.retry();
  }
  return {
    start:start,
    check:function() { retrySubscription(); send(); },
    reconnect:function() { retrySubscription(); send(true); },
    configure:function(next) {
      if (stopped || typeof next !== 'string' || next === instanceId) return;
      generation++;
      if (subscription) subscription.unsubscribe();
      subscription = null; instanceId = next; state = null; signature = ''; delivered = '';
      message = 'Waiting for Pebble weather'; save(); start();
    },
    stop:function() { stopped = true; generation++; if (subscription) subscription.unsubscribe(); },
    diagnostics:function() {
      return message + '\nLocation: ' + (instanceId || 'First Pebble weather location') +
        '\nConfigure weather locations and preferred sources in the Pebble app.';
    }
  };
}
module.exports = {create:create};
