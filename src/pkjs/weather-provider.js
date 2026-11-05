function create(env) {
  var provider = 'plugin', instance = '', active, generation = 0;
  try {
    var saved = JSON.parse(env.storage.getItem('clay-settings')) || {};
    provider = saved.WEATHER_PROVIDER === 'open-meteo' ? 'open-meteo' : 'plugin';
    instance = saved.WEATHER_PLUGIN_INSTANCE || '';
  } catch (error) {}
  function select() {
    var token = ++generation, options = {};
    Object.keys(env).forEach(function(key) { options[key] = env[key]; });
    options.send = function(payload,success,failure) {
      if (token !== generation) return;
      var message = {WEATHER_RESET:1};
      Object.keys(payload).forEach(function(key) { message[key] = payload[key]; });
      env.send(message,function() { if (token === generation && success) success(); },function(error) {
        if (token === generation && failure) failure(error);
      },'weather');
    };
    active = provider === 'open-meteo' ? require('./weather-service').create(options) : require('./plugin-weather').create(options,instance);
  }
  select();
  return {
    start:function() { active.start(); },
    check:function() { active.check(); },
    reconnect:function() { active.reconnect(); },
    diagnostics:function() { return active.diagnostics(); },
    configure:function(settings) {
      var next = settings.WEATHER_PROVIDER === undefined ? provider : settings.WEATHER_PROVIDER === 'open-meteo' ? 'open-meteo' : 'plugin';
      var nextInstance = settings.WEATHER_PLUGIN_INSTANCE === undefined ? instance : String(settings.WEATHER_PLUGIN_INSTANCE);
      var changed = next !== provider || nextInstance !== instance;
      if (changed) {
        active.stop(); provider = next; instance = nextInstance; select();
        env.send({WEATHER_RESET:1},function() {},function() {},'weather');
      }
      if (provider === 'open-meteo') active.configure(settings);
      else if (changed) active.start();
    }
  };
}
module.exports = {create:create};
