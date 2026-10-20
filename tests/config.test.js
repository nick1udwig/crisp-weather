const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../src/pkjs/config');
const custom = require('../src/pkjs/custom-clay');
const fields = config.flatMap(item => item.items || [item]).filter(item => item.messageKey);
function page(storage = {}, theme = '0') {
  global.localStorage = {getItem:key=>storage[key] ?? null,setItem:(key,value)=>{storage[key]=value;}};
  const items = Object.fromEntries(fields.map(field => [field.messageKey, {
    value:field.messageKey === 'THEME' ? theme : field.defaultValue, handlers:{},
    get() { return this.value; },
    set(value) { this.value=value;this.handlers.change?.(); },
    on(event,handler) { this.handlers[event]=handler; }
  }]));
  const reset = {on(event,handler) { this[event]=handler; }};
  custom.call({EVENTS:{AFTER_BUILD:'build'},on(event,handler) { handler(); },
    getItemByMessageKey:key=>items[key],getItemById:id=>id === 'resetColors' ? reset : null});
  return {items,reset};
}
test.afterEach(()=>{delete global.localStorage;});

test('theme switches apply tick defaults and retain custom weather colors',()=>{
  const {items,reset}=page();
  assert.equal(items.CURRENT_TEMP_COLOR.get(),'ffffff');
  assert.equal(items.FUTURE_TEMP_COLOR.get(),'ffaa00');
  items.THEME.set('1');
  assert.equal(items.CURRENT_TEMP_COLOR.get(),'000000');
  assert.equal(items.FUTURE_TEMP_COLOR.get(),'0055aa');
  assert.equal(items.HOUR_MARKERS_COLOR.get(),'000000');
  assert.equal(items.MINUTE_MARKERS_COLOR.get(),'555555');
  assert.equal(items.CHARGING_MARKERS_COLOR.get(),'005500');
  items.CURRENT_TEMP_COLOR.set('005555');items.FUTURE_TEMP_COLOR.set('550055');
  items.THEME.set('0');items.THEME.set('1');
  assert.equal(items.CURRENT_TEMP_COLOR.get(),'005555');
  assert.equal(items.FUTURE_TEMP_COLOR.get(),'550055');
  reset.click();
  assert.equal(items.CURRENT_TEMP_COLOR.get(),'000000');
  assert.equal(items.FUTURE_TEMP_COLOR.get(),'0055aa');
});
test('saved light defaults migrate once while edited colors survive',()=>{
  const storage={'crisp-palette-1':JSON.stringify({FUTURE_TEMP_COLOR:'ffaa00',
    CALENDAR_DAY_COLOR:'0055aa',HANDS_COLOR:'550055'})};
  let view=page(storage,'1');
  assert.equal(view.items.FUTURE_TEMP_COLOR.get(),'0055aa');
  assert.equal(view.items.CALENDAR_DAY_COLOR.get(),'000055');
  assert.equal(view.items.HANDS_COLOR.get(),'550055');
  view.items.FUTURE_TEMP_COLOR.set('ffaa00');
  view=page(storage,'1');
  assert.equal(view.items.FUTURE_TEMP_COLOR.get(),'ffaa00');
  assert.equal(view.items.HANDS_COLOR.get(),'550055');
});
test('all default light accents have strong contrast after Pebble color quantization',()=>{
  const {items}=page({},'1');
  for(const field of fields.filter(f=>f.type === 'color')){
    const color=parseInt(items[field.messageKey].get(),16);
    const channels=[16,8,0].map(shift=>Math.floor(((color>>shift)&255)/64)*85/255)
      .map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
    const luminance=channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
    assert(1.05/(luminance+0.05)>=7,field.messageKey);
  }
});
