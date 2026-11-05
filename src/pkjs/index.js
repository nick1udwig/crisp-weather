var Clay = require('@rebble/clay');
var messageKeys = require('message_keys');
require('./settings-migration').run(localStorage);
var clay = new Clay(require('./config'),require('./custom-clay'),{autoHandleEvents:false});
var sources = require('./plugin-sources');
var sourceHub = sources.create(Pebble);
var delivery = require('./delivery').create({
  send:function(payload, success, failure) { Pebble.sendAppMessage(payload,success,failure); },
  setTimeout:function(callback,delay) { return setTimeout(callback,delay); },
  clearTimeout:function(handle) { clearTimeout(handle); }
});
var pendingSettings;
try { pendingSettings = JSON.parse(localStorage.getItem('crisp-pending-settings')); } catch (error) {}
function sendSettings(settings) {
  pendingSettings = settings;
  try { localStorage.setItem('crisp-pending-settings',JSON.stringify(settings)); } catch (error) {}
  delivery.send(settings,function() {
    if (pendingSettings !== settings) return;
    pendingSettings = null;
    try { localStorage.setItem('crisp-pending-settings','null'); } catch (error) {}
  },function(error) { console.log('Config send failed: ' + JSON.stringify(error)); }, 'settings');
}
var corners = require('./complications').create({storage:localStorage, sources:sourceHub,
  now:function() { return Date.now(); }, send:delivery.send});
var weather = require('./plugin-weather').create({sources:sourceHub, storage:localStorage,
  now:function() { return Date.now(); }, send:delivery.send});
Pebble.addEventListener('ready',function() {
  console.log('Crisp PebbleKit JS ready');
  if (pendingSettings) sendSettings(pendingSettings);
  weather.start();
  corners.start();
});
Pebble.addEventListener('appmessage',function(e) {
  if (!e || !e.payload) return;
  var request = e.payload.WEATHER_REQUEST;
  if (request === undefined) request = e.payload[messageKeys.WEATHER_REQUEST];
  if (request === undefined) return;
  if (request && pendingSettings) sendSettings(pendingSettings);
  if (request) weather.reconnect(); else weather.check();
  corners.refresh(!!request);
});
Pebble.addEventListener('showConfiguration',function() {
  clay.meta.userData.weatherStatus = weather.diagnostics();
  var options = sources.catalogue(Pebble);
  clay.config.forEach(function(section) {
    (section.items || []).forEach(function(item) {
      if (/_INSTANCE$/.test(item.messageKey || '')) {
        var saved;
        try { saved = JSON.parse(localStorage.getItem('clay-settings')) || {}; } catch (error) { saved = {}; }
        var id = saved[item.messageKey];
        item.options = [{value:'',label:'First instance'}];
        if (id) item.options.push({value:id,label:id});
        return;
      }
      if (require('./complications').keys.indexOf(item.messageKey) < 0) return;
      item.options = require('./config').filter(function(s) { return s.items; }).reduce(function(all,s) { return all.concat(s.items); },[])
        .filter(function(field) { return field.messageKey === item.messageKey; })[0].options.concat(options);
      var chosen = corners.choices()[require('./complications').keys.indexOf(item.messageKey)];
      if (!item.options.some(function(option) { return option.value === chosen; })) item.options.push({value:chosen,label:'Unavailable reading'});
    });
  });
  Pebble.openURL(clay.generateUrl());
});
Pebble.addEventListener('webviewclosed',function(e) {
  if (!e || !e.response) return;
  try {
    var raw = clay.getSettings(e.response,false), location = raw.WEATHER_PLUGIN_INSTANCE;
    weather.configure(location && typeof location === 'object' ? location.value : location);
    corners.configure(raw);
    Object.keys(raw).forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(messageKeys,key)) delete raw[key]; });
    var settings = Clay.prepareSettingsForAppMessage(raw);
    sendSettings(settings);
    corners.apply();
  } catch (error) { console.log('Config error: ' + error); }
});

Pebble.addEventListener('configmessage',function(e) {
  var binding = e.data && sources.parse(e.data.source);
  if (!binding) { e.respond({error:'Invalid source'}); return; }
  var subscription, done = false;
  var timer = setTimeout(function() { finish({error:'Waiting for plugin data. Retrying…',retry:true}); },8000);
  function finish(reply) {
    if (done) return;
    done = true; clearTimeout(timer);
    if (subscription) subscription.unsubscribe();
    e.respond(reply);
  }
  subscription = sourceHub.subscribe(binding,function(envelope) {
    finish({instances:(envelope.instances || []).map(function(instance) {
      var p = instance.properties || {};
      return {value:instance.instanceId,label:sources.text(p.name) || instance.instanceId,preview:sources.format(p[binding.property])};
    })});
  },function(error) {
    var code = error && error.code || 'PLUGIN_UNAVAILABLE';
    var message = code;
    if (code === 'PERMISSION_DENIED') message = binding.category === 'weather' ?
      'Allow Location for Crisp Weather in the Pebble app.' : 'Allow this source for Crisp Weather in the Pebble app.';
    else if (code === 'PLUGIN_UNAVAILABLE') message = 'Enable plugins and select a source in the Pebble app.';
    else if (code === 'TIMEOUT') message = 'The plugin did not respond. Retrying…';
    else if (code === 'RATE_LIMITED') message = 'The plugin is busy. Retrying…';
    finish({error:message,retry:code !== 'INVALID_REQUEST'});
  });
  if (done) subscription.unsubscribe();
});
