const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const custom=require('../src/pkjs/custom-clay');
const {runtime}=require('./helpers/weather');
const first=JSON.stringify({category:'weather',item:'location',property:'temperature'});
const second=JSON.stringify({category:'phone',item:'phone_state',property:'battery_level'});
function field(value,options) {
  const item={value,options,handlers:[],hidden:false,get(){return this.value;},
    set(next){this.value=this.options&&!this.options.includes(next)?'':next;this.handlers.slice().forEach(fn=>fn());},
    on(event,fn){this.handlers.push(fn);},off(fn){this.handlers=this.handlers.filter(handler=>handler!==fn);},
    hide(){this.hidden=true;},show(){this.hidden=false;}};
  item.$manipulatorTarget={set(name,html){assert.equal(name,'innerHTML');item.options=[...html.matchAll(/value="([^"]*)"/g)].map(match=>match[1]);item.value=item.options[0]||'';}};
  return item;
}
function page(key='CORNER_TL',bridge=true) {
  const clock=runtime(),source=field(first),instance=field('old-id',['','old-id']);
  const preview=field(''),requests=[],ready=[];
  const items=key==='WEATHER_PLUGIN_INSTANCE'?{[key]:instance}:{[key]:source,[key+'_INSTANCE']:instance};
  const pebble={addEventListener(event,fn){ready.push(fn);}};
  if(bridge)pebble.sendMessage=(target,message)=>new Promise((resolve,reject)=>requests.push({target,message,resolve,reject}));
  vm.runInNewContext('('+custom.toString()+').call(page)',{Pebble:pebble,setTimeout:clock.env.setTimeout,clearTimeout:clock.env.clearTimeout,page:{
    EVENTS:{AFTER_BUILD:'build'},on(event,fn){fn();},getItemByMessageKey:name=>items[name],
    getItemById:id=>id===key+'_PREVIEW'?preview:null
  }});
  return {source,instance,preview,requests,advance:clock.advance,timers:clock.timers,ready(){ready.forEach(fn=>fn({target:'pkjs'}));}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(id,preview='75%')=>({instances:[{value:id,label:id,preview}]});
test('changing a corner source clears the saved instance and old options before lookup completes',async()=>{
  const p=page();assert.equal(p.instance.get(),'old-id');
  p.source.set(second);
  assert.equal(p.instance.get(),'');assert.deepEqual(p.instance.options,['']);
  p.requests[0].resolve(reply('old-id'));await flush();
  assert.equal(p.instance.get(),'');assert.deepEqual(p.instance.options,['']);
  p.requests[1].resolve(reply('new-id'));await flush();
  assert.equal(p.instance.get(),'');assert.deepEqual(p.instance.options,['','new-id']);
  p.instance.set('new-id');assert.equal(p.preview.get(),'75%');
});
test('a rejected instance lookup cannot leave a previous source instance selected',async()=>{
  const p=page();p.source.set(second);p.requests[1].reject(new Error('Unavailable'));await flush();
  assert.equal(p.instance.get(),'');assert.deepEqual(p.instance.options,['']);assert.equal(p.preview.get(),'Plugin unavailable. Retrying…');
});
test('source changes clear instances even when the configuration bridge is unavailable',()=>{
  const p=page('CORNER_TL',false);p.source.set(second);
  assert.equal(p.instance.get(),'');assert.deepEqual(p.instance.options,['']);
});
test('reopening settings preserves a saved instance until the user changes sources',async()=>{
  const p=page();assert.equal(p.instance.get(),'old-id');
  p.requests[0].resolve(reply('old-id'));await flush();assert.equal(p.instance.get(),'old-id');
  p.ready();p.instance.set('');p.requests[1].resolve(reply('old-id'));await flush();
  assert.equal(p.instance.get(),'');
});
test('old preview handlers and replies cannot overwrite a new source preview',async()=>{
  const p=page();p.requests[0].resolve(reply('old-id','Old'));await flush();
  assert.equal(p.preview.get(),'Old');p.source.set(second);
  assert.equal(p.preview.get(),'Loading plugin reading…');
  p.instance.set('');assert.equal(p.preview.get(),'Loading plugin reading…');
  p.source.set(first);p.requests[1].resolve(reply('new-id','Wrong'));await flush();
  assert.equal(p.preview.get(),'Loading plugin reading…');assert.equal(p.instance.get(),'');
  p.requests[2].resolve(reply('old-id','Correct'));await flush();assert.equal(p.preview.get(),'Correct');
});
test('weather locations query the fixed source and preserve the current choice across delayed replies',async()=>{
  const p=page('WEATHER_PLUGIN_INSTANCE');
  assert.equal(p.requests[0].message.source,first);assert(!p.instance.hidden);
  p.requests[0].resolve(reply('old-id','18°C'));await flush();
  assert.equal(p.instance.get(),'old-id');assert.equal(p.preview.get(),'18°C');
  p.ready();p.instance.set('');p.requests[1].resolve(reply('new-id','20°C'));await flush();
  assert.equal(p.instance.get(),'');assert.equal(p.preview.get(),'20°C');
});
test('a weather timeout retries and shows late data without reopening settings',async()=>{
  const p=page('WEATHER_PLUGIN_INSTANCE');
  p.requests[0].resolve({error:'Waiting for plugin data. Retrying…',retry:true});await flush();
  assert.equal(p.instance.get(),'old-id');assert.deepEqual(p.instance.options,['','old-id']);
  p.advance(4999);assert.equal(p.requests.length,1);
  p.advance(1);assert.equal(p.requests.length,2);
  assert.equal(p.preview.get(),'Waiting for plugin data. Retrying…');
  p.requests[1].resolve(reply('old-id','18°C'));await flush();
  assert.equal(p.preview.get(),'18°C');assert.equal(p.instance.get(),'old-id');
  p.advance(60000);assert.equal(p.requests.length,2);
});
test('retries back off and preserve the location selected while waiting',async()=>{
  const p=page('WEATHER_PLUGIN_INSTANCE');
  for(const delay of [5000,10000,20000,30000,30000]) {
    const count=p.requests.length;
    p.requests.at(-1).resolve({error:'Allow Location',retry:true});await flush();
    p.advance(delay-1);assert.equal(p.requests.length,count);
    p.advance(1);assert.equal(p.requests.length,count+1);
  }
  p.instance.set('');p.requests.at(-1).resolve(reply('old-id','18°C'));await flush();
  assert.equal(p.instance.get(),'');assert.equal(p.preview.get(),'18°C');
});
test('source changes cancel scheduled retries and ignore old retry replies',async()=>{
  const p=page();p.requests[0].resolve({error:'Waiting',retry:true});await flush();
  p.source.set(second);p.advance(30000);assert.equal(p.requests.length,2);
  p.requests[1].reject(new Error('Bridge unavailable'));await flush();p.advance(5000);
  assert.equal(p.requests.length,3);assert.equal(p.requests[2].message.source,second);
  p.source.set('auto');p.requests[2].resolve({error:'Waiting',retry:true});await flush();
  p.advance(60000);assert.equal(p.requests.length,3);
  assert.equal(p.preview.get(),'Uses the next available preferred complication.');
});
test('invalid requests do not retry',async()=>{
  const p=page('WEATHER_PLUGIN_INSTANCE');p.requests[0].resolve({error:'INVALID_REQUEST',retry:false});await flush();
  p.advance(60000);assert.equal(p.requests.length,1);assert.equal(p.preview.get(),'INVALID_REQUEST');
});
