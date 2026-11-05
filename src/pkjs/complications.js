var sources = require('./plugin-sources');
var KEYS = ['CORNER_TL','CORNER_TR','CORNER_BL','CORNER_BR'];
var DEFAULTS = ['1','3','4','5'];
function create(env) {
  var choices = DEFAULTS.slice(), instances = ['','','',''], subscriptions = [], preferred = [], generation = 0;
  var cache = [], readings = [null,null,null,null], sent = [], errors = ['', '', '', ''], preferenceSubscription;
  function load() {
    try {
      cache = JSON.parse(env.storage.getItem('crisp-corner-cache')) || [];
      if (!Array.isArray(cache)) cache = [];
    } catch (error) {}
    try {
      var saved = JSON.parse(env.storage.getItem('clay-settings')) || {};
      KEYS.forEach(function(key, i) {
        choices[i] = saved[key] === undefined ? DEFAULTS[i] : String(saved[key]);
        instances[i] = saved[key + '_INSTANCE'] || '';
      });
    } catch (error) {}
  }
  function identity(i) { return JSON.stringify([choices[i],instances[i]]); }
  function remember(i) {
    cache[i] = {identity:identity(i),reading:readings[i]};
    try { env.storage.setItem('crisp-corner-cache',JSON.stringify(cache)); } catch (error) {}
  }
  function remote(i) { return choices[i] === 'auto' || !!sources.parse(choices[i]); }
  function push(i, force) {
    if (!remote(i)) return;
    var reading = readings[i], now = Math.floor(env.now()/1000);
    var until = reading && reading.until > now ? reading.until : 0;
    var message = {CORNER_SLOT:i, CORNER_TEXT:until ? reading.text : '--', CORNER_UNTIL:until};
    var signature = JSON.stringify(message);
    if (!force && sent[i] === signature) return;
    sent[i] = signature;
    env.send(message, function() {}, function() { if (sent[i] === signature) sent[i] = ''; }, 'corner-' + i);
  }
  function bindingKey(binding) { return JSON.stringify([binding.category,binding.item,binding.property,binding.index]); }
  function render() {
    var used = [];
    KEYS.forEach(function(key,i) {
      if (choices[i] !== 'auto') return;
      readings[i] = null;
      preferred.some(function(candidate) {
        var id = bindingKey(candidate.binding);
        if (!candidate.reading || candidate.reading.until <= env.now()/1000 || used.indexOf(id) >= 0) return false;
        used.push(id); readings[i] = candidate.reading; return true;
      });
    });
    KEYS.forEach(function(key,i) { push(i); });
  }
  function receive(binding, envelope) {
    var list = envelope && Array.isArray(envelope.instances) ? envelope.instances : [];
    var instance = binding.instanceId ? list.filter(function(item) { return item.instanceId === binding.instanceId; })[0] : list[binding.index || 0];
    var reading = instance && instance.properties && instance.properties[binding.property];
    var formatted = sources.format(reading);
    var expiry = envelope && envelope.validUntilMs;
    var until = typeof expiry === 'number' && isFinite(expiry) ? Math.floor(expiry/1000) : Math.floor(env.now()/1000) + 300;
    until = Math.min(until, Math.floor(env.now()/1000) + 86400, 2147483647);
    return formatted !== '--' && until > env.now()/1000 ? {text:formatted, until:until} : null;
  }
  function rebuild() {
    var current = ++generation;
    subscriptions.forEach(function(subscription) { subscription.unsubscribe(); });
    subscriptions = [];
    readings = KEYS.map(function(key,i) { return cache[i] && cache[i].identity === identity(i) ? cache[i].reading : null; });
    preferred.forEach(function(candidate) { candidate.reading = null; });
    render();
    KEYS.forEach(function(key,i) {
      var binding = sources.parse(choices[i]);
      if (!binding) return;
      binding.instanceId = instances[i];
      subscriptions.push(env.sources.subscribe(binding, function(envelope) {
        if (current !== generation) return;
        readings[i] = receive(binding,envelope); remember(i); errors[i] = ''; push(i);
      }, function(error) {
        if (current !== generation) return;
        errors[i] = error && error.code || 'PLUGIN_UNAVAILABLE';
        if (errors[i] === 'PERMISSION_DENIED') { readings[i] = null; remember(i); }
        push(i);
      }));
    });
    if (choices.indexOf('auto') >= 0) preferred.forEach(function(candidate) {
      subscriptions.push(env.sources.subscribe(candidate.binding, function(envelope) {
        if (current !== generation) return;
        candidate.reading = receive(candidate.binding,envelope); render();
      }, function() {
        if (current !== generation) return;
        candidate.reading = null; render();
      }));
    });
  }
  function updatePreferences() {
    if (preferenceSubscription) { preferenceSubscription.unsubscribe(); preferenceSubscription = null; }
    if (choices.indexOf('auto') < 0) return;
    preferenceSubscription = env.sources.subscribe({category:'preferences',item:'complications'}, function(envelope) {
      preferred = (envelope.instances || []).slice(0,5).map(function(instance) {
        var p = instance.properties || {}, index = p.index && p.index.numericValue && p.index.numericValue.value;
        return {binding:{category:sources.text(p.category),item:sources.text(p.item),property:sources.text(p.property),index:index}};
      }).filter(function(entry) { return sources.parse(entry.binding) && typeof entry.binding.index === 'number' && entry.binding.index >= 0 && entry.binding.index % 1 === 0; });
      rebuild();
    }, function() { preferred = []; rebuild(); });
  }
  function configure(raw) {
    KEYS.forEach(function(key,i) {
      var value = raw[key];
      if (value !== undefined) {
        choices[i] = String(value && typeof value === 'object' ? value.value : value);
        if (!remote(i) && !/^[0-6]$/.test(choices[i])) choices[i] = '0';
        raw[key] = {value:remote(i) ? '7' : choices[i]};
      }
      var instance = raw[key + '_INSTANCE'];
      if (instance !== undefined) instances[i] = String(instance && typeof instance === 'object' ? instance.value : instance);
      delete raw[key + '_INSTANCE'];
    });
  }
  load();
  return {
    start:function() { rebuild(); updatePreferences(); },
    configure:configure,
    apply:function() { sent = []; rebuild(); updatePreferences(); },
    refresh:function(force) { render(); if (force) KEYS.forEach(function(key,i) { push(i,true); }); },
    diagnostics:function() { return errors.filter(Boolean).join(', '); },
    choices:function() { return choices.slice(); }
  };
}
module.exports = {create:create, keys:KEYS};
