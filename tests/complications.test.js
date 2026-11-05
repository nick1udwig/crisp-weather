const {test}=require('node:test');
const assert=require('node:assert/strict');
const sources=require('../src/pkjs/plugin-sources');
const {runtime}=require('./helpers/weather');
const {create}=require('../src/pkjs/complications');
const binding=JSON.stringify({category:'phone',item:'phone_state',property:'battery_level'});
function fixture(settings={CORNER_TL:binding}) {
  const f=runtime(), subscriptions=[];
  f.env.storage.setItem('clay-settings',JSON.stringify(settings));
  const pebble={subscribeToSource(request){const s={request,closed:false,unsubscribe(){this.closed=true;}};subscriptions.push(s);return s;}};
  const hub=sources.create(pebble);
  const corners=create({...f.env,sources:hub});
  corners.start();
  const envelope=(value,expiry=f.env.now()+60000)=>({validUntilMs:expiry,instances:[{instanceId:'phone',properties:{battery_level:{numericValue:{value,unit:'%'}}}}]});
  return {...f,corners,subscriptions,hub,envelope};
}
test('corners share subscriptions, expire, replay and reject removed instances',()=>{
  const f=fixture({CORNER_TL:binding,CORNER_TR:binding,CORNER_TR_INSTANCE:'removed'});
  assert.equal(f.subscriptions.length,1);
  f.subscriptions[0].request.onData(f.envelope(72));
  assert.equal(f.sent.at(-1).CORNER_TEXT,'72%');
  assert.equal(f.sent.at(-1).CORNER_SLOT,0);
  f.corners.refresh(true);
  assert.equal(f.sent.at(-1).CORNER_TEXT,'--');
  f.advance(60000);f.corners.refresh(true);
  assert(f.sent.slice(-2).every(p=>p.CORNER_TEXT==='--'));
});
test('selection changes unsubscribe and ignore callbacks from the old selection',()=>{
  const f=fixture();const old=f.subscriptions[0];
  const raw={CORNER_TL:{value:'auto'},CORNER_TL_INSTANCE:{value:'phone'}};
  f.corners.configure(raw);f.corners.apply();
  assert.equal(raw.CORNER_TL.value,'7');assert.equal(raw.CORNER_TL_INSTANCE,undefined);
  assert(old.closed);
  const count=f.sent.length;old.request.onData(f.envelope(50));assert.equal(f.sent.length,count);
});
test('permission denial clears a cached reading and later updates recover',()=>{
  const f=fixture(), request=f.subscriptions[0].request;
  request.onData(f.envelope(72));request.onError({code:'PERMISSION_DENIED'});
  assert.equal(f.sent.at(-1).CORNER_TEXT,'--');
  request.onData(f.envelope(73));assert.equal(f.sent.at(-1).CORNER_TEXT,'73%');
});
test('automatic slots skip unreadable preferences and use distinct available readings',()=>{
  const f=fixture({CORNER_TL:'auto',CORNER_TR:'auto'});
  f.subscriptions[0].request.onData({instances:['battery_level','missing','other'].map(property=>({properties:{
    category:{shortText:{text:'phone'}},item:{shortText:{text:'phone_state'}},property:{shortText:{text:property}},index:{numericValue:{value:0}}
  }}))});
  const envelope=f.envelope(72);envelope.instances[0].properties.other={shortText:{text:'Next'}};
  f.subscriptions.at(-1).request.onData(envelope);
  assert.equal(f.sent.at(-2).CORNER_TEXT,'72%');assert.equal(f.sent.at(-1).CORNER_TEXT,'Next');
});
test('bounded text preserves UTF-8 and handles malformed shapes',()=>{
  assert.equal(sources.compact('😀😀😀😀😀😀😀😀'),'😀😀😀😀😀😀😀');
  assert.equal(Buffer.byteLength(sources.compact('😀😀😀😀😀😀😀😀')),28);
  assert.equal(sources.format({shortText:{text:'A\nB'}}),'A B');
  assert.equal(sources.format({numericValue:{value:NaN}}),'--');
  assert.equal(sources.format({numericValue:{value:12000}}),'12k');
  assert.equal(sources.compact('\uD800'),'?');
});
test('catalogue filters unsupported shapes and deduplicates preferred sources',()=>{
  const plugin={sources:[{category:'test',items:['item'],properties:{text:['shortText'],image:['image'],series:['series.numericValue']}}]};
  assert.equal(sources.catalogue({enumeratePlugins:()=>[plugin,plugin]}).length,1);
});
test('transient errors keep valid readings and missing properties clear them',()=>{
  const f=fixture(), request=f.subscriptions[0].request;
  request.onData(f.envelope(72));request.onError({code:'TIMEOUT'});
  f.corners.refresh(true);assert.equal(f.sent.at(-1).CORNER_TEXT,'72%');
  request.onData({instances:[]});assert.equal(f.sent.at(-1).CORNER_TEXT,'--');
});
test('restart replays cached text without extending its expiry',()=>{
  const f=fixture();f.subscriptions[0].request.onData(f.envelope(72));
  const until=f.sent.at(-1).CORNER_UNTIL;
  const resumed=create({...f.env,sources:sources.create({subscribeToSource(){return {unsubscribe(){}};}})});
  resumed.start();assert.equal(f.sent.at(-1).CORNER_TEXT,'72%');assert.equal(f.sent.at(-1).CORNER_UNTIL,until);
});
