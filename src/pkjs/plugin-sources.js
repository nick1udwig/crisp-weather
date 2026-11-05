var SHAPES = ['shortText', 'numericValue', 'timestamp'];
function text(reading) {
  return reading && reading.shortText && typeof reading.shortText.text === 'string' ? reading.shortText.text : '';
}
function catalogue(pebble) {
  if (typeof pebble.enumeratePlugins !== 'function') return [];
  var entries = [];
  try {
    pebble.enumeratePlugins().forEach(function(plugin) {
      (plugin.sources || []).forEach(function(source) {
        (source.items || []).forEach(function(item) {
          Object.keys(source.properties || {}).forEach(function(property) {
            if (!(source.properties[property] || []).some(function(shape) { return SHAPES.indexOf(shape) >= 0; })) return;
            var binding = {category:source.category, item:item, property:property};
            var value = JSON.stringify(binding);
            if (entries.some(function(entry) { return entry.value === value; })) return;
            entries.push({value:value, label:source.category + ' / ' + item + ' / ' + property});
          });
        });
      });
    });
  } catch (error) { return []; }
  return entries;
}
function parse(value) {
  try {
    var binding = typeof value === 'string' ? JSON.parse(value) : value;
    if (!binding || !['category','item','property'].every(function(key) {
      return typeof binding[key] === 'string' && binding[key].length > 0 && binding[key].length <= 128;
    })) return null;
    return {category:binding.category, item:binding.item, property:binding.property};
  } catch (error) { return null; }
}
function compact(value) {
  var result = '', bytes = 0, count = 0;
  for (var i = 0; i < value.length && count < 7; i++) {
    var code = value.charCodeAt(i), part = value.charAt(i);
    if (code < 32 || code === 127) part = ' ';
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < value.length &&
        value.charCodeAt(i+1) >= 0xDC00 && value.charCodeAt(i+1) <= 0xDFFF) part += value.charAt(++i);
    else if (code >= 0xD800 && code <= 0xDFFF) part = '?';
    var size = unescape(encodeURIComponent(part)).length;
    if (bytes + size > 28) break;
    result += part; bytes += size; count++;
  }
  return result;
}
function format(reading) {
  if (!reading) return '--';
  var value = text(reading);
  if (!value && reading.numericValue) {
    var number = reading.numericValue.value;
    if (typeof number === 'number' && isFinite(number)) {
      var suffix = reading.numericValue.unit || '';
      value = Math.abs(number) >= 1000 ? (number/1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(number*10)/10);
      value += suffix;
    }
  }
  if (!value && reading.timestamp && typeof reading.timestamp.value === 'number' && isFinite(reading.timestamp.value)) {
    var date = new Date(reading.timestamp.value * 1000);
    if (isFinite(date.getTime())) value = date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2);
  }
  return compact(value) || '--';
}
function create(pebble, now) {
  now = now || function() { return Date.now(); };
  var groups = {};
  function connect(key, group) {
    if (groups[key] !== group || group.subscription || group.connecting) return;
    var attempt = ++group.attempt;
    group.connecting = true;
    try {
      var subscription = pebble.subscribeToSource({category:group.category, item:group.item,
        onData:function(envelope) {
          if (groups[key] !== group || group.attempt !== attempt) return;
          group.envelope = envelope;
          group.error = null;
          group.receivedAtMs = now();
          group.listeners.slice().forEach(function(l) { l.data(envelope,group.receivedAtMs); });
        },
        onError:function(err) {
          if (groups[key] !== group || group.attempt !== attempt) return;
          group.error = err;
          if (err && err.code === 'PERMISSION_DENIED') group.envelope = null;
          group.listeners.slice().forEach(function(l) { l.error(err); });
        }});
      if (groups[key] === group) group.subscription = subscription;
      else if (subscription) subscription.unsubscribe();
    } catch (err) {
      group.attempt++;
      group.listeners.slice().forEach(function(l) { l.error(err); });
    } finally { group.connecting = false; }
  }
  function subscribe(binding, data, error) {
    var key = JSON.stringify([binding.category, binding.item]), group = groups[key];
    var listener = {data:data, error:error};
    if (!group) group = groups[key] = {category:binding.category, item:binding.item,
      listeners:[], subscription:null, envelope:null, connecting:false, attempt:0};
    group.listeners.push(listener);
    if (group.envelope) data(group.envelope,group.receivedAtMs);
    if (group.error && group.subscription) error(group.error);
    connect(key,group);
    return {
      retry:function() { if (group.listeners.indexOf(listener) >= 0) connect(key,group); },
      unsubscribe:function() {
        if (group.listeners.indexOf(listener) < 0) return;
        group.listeners = group.listeners.filter(function(l) { return l !== listener; });
        if (!group.listeners.length) {
          delete groups[key];
          if (group.subscription) group.subscription.unsubscribe();
        }
      }
    };
  }
  return {subscribe:subscribe};
}

module.exports = {create:create, catalogue:catalogue, parse:parse, text:text, format:format, compact:compact};
