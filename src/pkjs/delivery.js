function create(env) {
  var pending = [], active = null;
  function pump() {
    if (active || !pending.length) return;
    active = pending.shift();
    attempt();
  }
  function finish(error) {
    var item = active;
    active = null;
    if (error) { if (item.failure) item.failure(error); }
    else if (item.success) item.success();
    pump();
  }
  function attempt() {
    var item = active, settled = false;
    var timer = env.setTimeout(function() { complete({error:'DELIVERY_TIMEOUT'}); },10000);
    function complete(error) {
      if (settled) return;
      settled = true;
      env.clearTimeout(timer);
      if (error && ++item.attempts < 3) env.setTimeout(attempt, 1000 * item.attempts);
      else finish(error);
    }
    try { env.send(item.payload, function() { complete(); }, complete); }
    catch (error) { complete(error); }
  }
  return {
    send: function(payload, success, failure, channel) {
      if (channel) pending = pending.filter(function(item) { return item.channel !== channel; });
      pending.push({payload:payload, success:success, failure:failure, channel:channel, attempts:0});
      pump();
    }
  };
}
module.exports = {create:create};
