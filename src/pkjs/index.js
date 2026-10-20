// Phone-side glue. Clay renders the configuration page, persists the chosen
// values and, on close, transmits every messageKey to the watch automatically
// (toggles as 0/1, colors as 0xRRGGBB, selects as their value). The watch maps
// each key onto its persisted setting in src/c/comm.c.
//
// On top of Clay this also relays weather: it geolocates the phone, queries the
// free, key-less Open-Meteo API for today's low/high temperature and the
// current hour's precipitation probability, and sends them to the watch so the
// corner readouts (Weather / Rain chance) can display them.
var Clay = require('@rebble/clay');
var clayConfig = require('./config');
// Custom Clay logic: remember a separate accent palette per theme and swap the
// color pickers when the Theme select changes.
var customClay = require('./custom-clay');
var clay = new Clay(clayConfig, customClay);

var weather = require('./weather-service').create({
  storage:localStorage,
  now:function() { return Date.now(); },
  setTimeout:setTimeout,
  clearTimeout:clearTimeout,
  geolocation:navigator.geolocation,
  XMLHttpRequest:XMLHttpRequest,
  send:function(payload, success, failure) { Pebble.sendAppMessage(payload, success, failure); },
  log:function(message) { console.log(message); }
});
Pebble.addEventListener('ready', function() {
  console.log('Crisp PebbleKit JS ready');
  weather.start();
});

// Diagnostic: log what the config page actually produced on close (visible in
// `pebble logs`). Clay still auto-sends; this listener only reads and logs, so
// it confirms whether the theme/palette swap in custom-clay.js took effect.
Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) {
    return;
  }
  try {
    // With convert === false each entry is a { value: ... } object; unwrap it.
    var dict = clay.getSettings(e.response, false);
    var val = function(x) {
      return (x && typeof x === 'object') ? x.value : x;
    };
    console.log('Config closed: THEME=' + val(dict.THEME) +
      ' HOUR=' + val(dict.HOUR_MARKERS_COLOR) +
      ' MIN=' + val(dict.MINUTE_MARKERS_COLOR) +
      ' DAY=' + val(dict.CALENDAR_DAY_COLOR));
  } catch (err) {
    console.log('Config close log error: ' + err);
  }
});
