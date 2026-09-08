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

// --- Weather tunables -----------------------------------------------------
var WEATHER_REFRESH_MS = 30 * 60 * 1000;  // re-fetch every 30 minutes
var GEO_TIMEOUT_MS = 15000;
var GEO_MAX_AGE_MS = 10 * 60 * 1000;      // accept a cached fix up to 10 min old
var WEATHER_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

var forecast = require('./forecast');
function parseWeather(body) {
  var payload = forecast.parse(JSON.parse(body), Math.floor(Date.now() / 1000));
  Pebble.sendAppMessage(payload, function() {}, function(e) {
    console.log('Weather send failed: ' + JSON.stringify(e));
  });
}

function requestWeather(lat, lon) {
  var url = WEATHER_BASE_URL +
    '?latitude=' + lat +
    '&longitude=' + lon +
    '&current=temperature_2m' +
    '&hourly=precipitation_probability,temperature_2m,weather_code,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&timezone=auto&timeformat=unixtime&forecast_days=2';

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.timeout = 20000;
  xhr.onload = function() {
    if (xhr.status !== 200) { console.log("Weather HTTP " + xhr.status); return; }
    try {
      parseWeather(xhr.responseText);
    } catch (e) {
      console.log('Weather parse error: ' + e);
    }
  };
  xhr.ontimeout = function() { console.log("Weather request timed out"); };
  xhr.onerror = function() { console.log('Weather request failed'); };
  xhr.send();
}

function fetchWeather() {
  navigator.geolocation.getCurrentPosition(
    function(pos) { requestWeather(pos.coords.latitude, pos.coords.longitude); },
    function(err) { console.log('Geolocation error: ' + err.message); },
    { timeout: GEO_TIMEOUT_MS, maximumAge: GEO_MAX_AGE_MS }
  );
}

Pebble.addEventListener('ready', function() {
  console.log('Crisp PebbleKit JS ready');
  fetchWeather();
  setInterval(fetchWeather, WEATHER_REFRESH_MS);
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
