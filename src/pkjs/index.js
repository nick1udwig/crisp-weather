var Clay = require('@rebble/clay');
var messageKeys = require('message_keys');
var clay = new Clay(require('./config'),require('./custom-clay'),{autoHandleEvents:false});
var weather = require('./weather-service').create({
  storage:localStorage,
  now:function() { return Date.now(); },
  random:Math.random,
  setTimeout:function(callback,delay) { return setTimeout(callback,delay); },
  clearTimeout:function(handle) { clearTimeout(handle); },
  geolocation:navigator.geolocation,
  XMLHttpRequest:XMLHttpRequest,
  send:function(payload, success, failure) { Pebble.sendAppMessage(payload,success,failure); },
  log:function(message) { console.log(message); }
});
Pebble.addEventListener('ready',function() {
  console.log('Crisp PebbleKit JS ready');
  weather.start();
});
Pebble.addEventListener('appmessage',function(e) {
  if (!e || !e.payload) return;
  var request = e.payload.WEATHER_REQUEST;
  if (request === undefined) request = e.payload[messageKeys.WEATHER_REQUEST];
  if (request === undefined) return;
  if (request) weather.reconnect(); else weather.check();
});
Pebble.addEventListener('showConfiguration',function() {
  clay.meta.userData.weatherStatus = weather.diagnostics();
  Pebble.openURL(clay.generateUrl());
});
Pebble.addEventListener('webviewclosed',function(e) {
  if (!e || !e.response) return;
  try {
    var raw = clay.getSettings(e.response,false), location = {};
    ['WEATHER_LOCATION_MODE','WEATHER_LATITUDE','WEATHER_LONGITUDE'].forEach(function(key) {
      var field = raw[key];
      location[key] = field && typeof field === 'object' ? field.value : field;
      delete raw[key];
    });
    weather.configure(location);
    var settings = Clay.prepareSettingsForAppMessage(raw);
    Pebble.sendAppMessage(settings,function() { console.log('Config sent'); },
      function(error) { console.log('Config send failed: ' + JSON.stringify(error)); });
  } catch (error) { console.log('Config error: ' + error); }
});
