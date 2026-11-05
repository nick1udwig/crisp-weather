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
test('corner refresh retries failed source setup without duplicating a recovered subscription',()=>{
  const f=runtime(), attempts=[];
  f.env.storage.setItem('clay-settings',JSON.stringify({CORNER_TL:binding}));
  const hub=sources.create({subscribeToSource(request){
    attempts.push(request);if(attempts.length===1)throw new Error('Unavailable');return {unsubscribe(){}};
  }});
  const corners=create({...f.env,sources:hub});corners.start();
  assert.equal(attempts.length,1);corners.refresh(true);assert.equal(attempts.length,2);
  attempts[1].onData({validUntilMs:f.env.now()+60000,instances:[{properties:{battery_level:{shortText:{text:'75%'}}}}]});
  assert.equal(f.sent.at(-1).CORNER_TEXT,'75%');corners.refresh(true);assert.equal(attempts.length,2);
});
function preferenceEnvelope(properties=['battery_level','other']) {
  return {instances:properties.map(property=>({properties:{
    category:{shortText:{text:'phone'}},item:{shortText:{text:'phone_state'}},property:{shortText:{text:property}},index:{numericValue:{value:0}}
  }}))};
}
function automaticFixture() {
  const f=fixture({CORNER_TL:'auto',CORNER_TR:'auto'});
  f.subscriptions[0].request.onData(preferenceEnvelope());
  const envelope=f.envelope(72);envelope.instances[0].properties.other={shortText:{text:'Next'}};
  f.subscriptions.at(-1).request.onData(envelope);
  return f;
}
function restartAutomatic(f) {
  const subscriptions=[];
  const hub=sources.create({subscribeToSource(request){const s={request,closed:false,unsubscribe(){this.closed=true;}};subscriptions.push(s);return s;}});
  const corners=create({...f.env,sources:hub});corners.start();
  return {corners,subscriptions};
}
function lastCorner(f,slot) { return f.sent.filter(message=>message.CORNER_SLOT===slot).at(-1); }
test('automatic corners survive restart while both preferences and source data are unavailable',()=>{
  const f=automaticFixture(), until=lastCorner(f,0).CORNER_UNTIL;
  f.advance(10000);const firstNewMessage=f.sent.length;
  const resumed=restartAutomatic(f);
  assert(f.sent.slice(firstNewMessage).every(message=>message.CORNER_TEXT!=='--'));
  assert.equal(lastCorner(f,0).CORNER_TEXT,'72%');assert.equal(lastCorner(f,1).CORNER_TEXT,'Next');
  assert.equal(lastCorner(f,0).CORNER_UNTIL,until);
  resumed.subscriptions.forEach(s=>s.request.onError({code:'TIMEOUT'}));
  resumed.corners.refresh(true);
  assert.equal(lastCorner(f,0).CORNER_TEXT,'72%');assert.equal(lastCorner(f,1).CORNER_TEXT,'Next');
  assert.equal(lastCorner(f,1).CORNER_UNTIL,until);
  f.advance(50000);resumed.corners.refresh(true);
  assert.equal(lastCorner(f,0).CORNER_TEXT,'--');assert.equal(lastCorner(f,1).CORNER_TEXT,'--');
  restartAutomatic(f);assert.equal(lastCorner(f,0).CORNER_TEXT,'--');
});
test('fresh preference order reuses matching cached readings and removes obsolete readings',()=>{
  const f=automaticFixture(),until=lastCorner(f,0).CORNER_UNTIL;
  const resumed=restartAutomatic(f), preferences=resumed.subscriptions.find(s=>s.request.category==='preferences');
  preferences.request.onData(preferenceEnvelope(['other','battery_level']));
  assert.equal(lastCorner(f,0).CORNER_TEXT,'Next');assert.equal(lastCorner(f,1).CORNER_TEXT,'72%');
  assert.equal(lastCorner(f,1).CORNER_UNTIL,until);
  preferences.request.onData(preferenceEnvelope(['unknown']));
  assert.equal(lastCorner(f,0).CORNER_TEXT,'--');assert.equal(lastCorner(f,1).CORNER_TEXT,'--');
  restartAutomatic(f);assert.equal(lastCorner(f,0).CORNER_TEXT,'--');
});
test('empty preferences and permission denial invalidate the automatic cache across restarts',()=>{
  for(const failure of ['empty','preferences','source']) {
    const f=automaticFixture(), resumed=restartAutomatic(f);
    const preferences=resumed.subscriptions.find(s=>s.request.category==='preferences');
    if(failure==='empty') preferences.request.onData({instances:[]});
    else resumed.subscriptions.find(s=>s.request.category===(failure==='preferences'?'preferences':'phone')).request.onError({code:'PERMISSION_DENIED'});
    assert.equal(lastCorner(f,0).CORNER_TEXT,'--');assert.equal(lastCorner(f,1).CORNER_TEXT,'--');
    restartAutomatic(f);assert.equal(lastCorner(f,0).CORNER_TEXT,'--');assert.equal(lastCorner(f,1).CORNER_TEXT,'--');
  }
});
test('a missing automatic reading clears its cached value and promotes the next preference',()=>{
  const f=automaticFixture(), resumed=restartAutomatic(f);
  const envelope=f.envelope(72);envelope.instances[0].properties={other:{shortText:{text:'Next'}}};
  resumed.subscriptions.find(s=>s.request.category==='phone').request.onData(envelope);
  assert.equal(lastCorner(f,0).CORNER_TEXT,'Next');assert.equal(lastCorner(f,1).CORNER_TEXT,'--');
  restartAutomatic(f);assert.equal(lastCorner(f,0).CORNER_TEXT,'Next');assert.equal(lastCorner(f,1).CORNER_TEXT,'--');
});
test('invalid automatic cache cannot break local choices or send malformed values',()=>{
  for(const value of ['bad JSON',JSON.stringify([null,{binding:{category:'phone',item:'phone_state',property:'battery_level',index:0},reading:{text:'X'.repeat(500),until:1700000060}}])]) {
    const f=fixture({CORNER_TL:'auto',CORNER_TR:'1'});
    f.env.storage.setItem('crisp-preferred-corners-v1',value);
    const start=f.sent.length,resumed=restartAutomatic(f);
    assert.equal(resumed.corners.choices()[1],'1');
    assert(f.sent.slice(start).every(message=>message.CORNER_SLOT===0&&message.CORNER_TEXT==='--'));
  }
});
test('automatic caches survive subscription setup failure until their original expiry',()=>{
  const f=automaticFixture(),until=lastCorner(f,0).CORNER_UNTIL;
  const corners=create({...f.env,sources:sources.create({subscribeToSource(){throw new Error('Unavailable');}})});
  corners.start();corners.refresh(true);
  assert.equal(lastCorner(f,0).CORNER_TEXT,'72%');assert.equal(lastCorner(f,0).CORNER_UNTIL,until);
  assert.equal(lastCorner(f,1).CORNER_TEXT,'Next');
});
test('denial clears only the affected source and keeps other automatic readings cached',()=>{
  const f=fixture({CORNER_TL:'auto',CORNER_TR:'auto'}),preferences=preferenceEnvelope();
  preferences.instances[1].properties.category.shortText.text='other';
  f.subscriptions[0].request.onData(preferences);
  f.subscriptions.find(s=>s.request.category==='phone').request.onData(f.envelope(72));
  f.subscriptions.find(s=>s.request.category==='other').request.onData({validUntilMs:f.env.now()+60000,instances:[{properties:{other:{shortText:{text:'Next'}}}}]});
  f.subscriptions.find(s=>s.request.category==='phone').request.onError({code:'PERMISSION_DENIED'});
  assert.equal(lastCorner(f,0).CORNER_TEXT,'Next');assert.equal(lastCorner(f,1).CORNER_TEXT,'--');
  restartAutomatic(f);assert.equal(lastCorner(f,0).CORNER_TEXT,'Next');assert.equal(lastCorner(f,1).CORNER_TEXT,'--');
});
