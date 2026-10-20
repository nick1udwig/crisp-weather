var KEY = 'crisp-weather-schedule-v1';
var MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
function number(n) { return typeof n === 'number' && isFinite(n) && n >= 0; }
function create(storage, now) {
  var state = {}, readable = true;
  try { state = JSON.parse(storage.getItem(KEY)) || {}; } catch (e) { readable = false; }
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  state.attempts = Array.isArray(state.attempts) ? state.attempts.filter(number).slice(-96) : [];
  state.next = number(state.next) ? state.next : 0;
  state.clock = number(state.clock) ? state.clock : now();
  function persist() {
    try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }
  function normalize() {
    var time = now();
    if (time < state.clock) {
      var shift = time - state.clock;
      state.attempts = state.attempts.map(function(t) { return t + shift; });
      state.next = Math.max(0, state.next + shift);
    }
    state.clock = time;
    state.attempts = state.attempts.filter(function(t) { return t > time - DAY; });
  }
  function wait() {
    normalize();
    var a = state.attempts, time = now(), next = state.next;
    if (a.length) next = Math.max(next, a[a.length-1] + MINUTE);
    if (a.length >= 6) next = Math.max(next, a[a.length-6] + HOUR);
    if (a.length >= 96) next = Math.max(next, a[a.length-96] + DAY);
    return Math.max(0, next - time);
  }
  function reserve() {
    if (wait() > 0 || !readable) return false;
    state.attempts.push(now());
    return persist();
  }
  function defer(delay) {
    normalize();
    state.next = Math.max(state.next, now() + delay);
    persist();
  }
  function success() { state.lastSuccess = now(); defer(30 * MINUTE); }
  function status() { return {next:now()+wait(), lastSuccess:state.lastSuccess || 0, attempts:state.attempts.length}; }
  return {wait:wait, reserve:reserve, defer:defer, success:success, status:status};
}
module.exports = {create:create};
