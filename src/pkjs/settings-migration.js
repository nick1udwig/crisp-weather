function run(storage) {
  ['crisp-weather-location-v1','crisp-weather-cache-v1','crisp-weather-schedule-v1'].forEach(function(key) {
    try { storage.removeItem(key); } catch (error) {}
  });
  try {
    var settings = JSON.parse(storage.getItem('clay-settings')), changed = false;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    ['WEATHER_PROVIDER','WEATHER_LOCATION_MODE','WEATHER_LATITUDE','WEATHER_LONGITUDE'].forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(settings,key)) { delete settings[key]; changed = true; }
    });
    if (changed) storage.setItem('clay-settings',JSON.stringify(settings));
  } catch (error) {}
}
module.exports = {run:run};
