const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../src/pkjs/config');
const custom = require('../src/pkjs/custom-clay');
const fields = config.flatMap(item => item.items || [item]).filter(item => item.messageKey);

test('forecast colors survive theme switches and migrate older palettes', () => {
  const storage = {'crisp-palette-1': JSON.stringify({HANDS_COLOR: '555555'})};
  global.localStorage = {getItem: key => storage[key] ?? null,
    setItem: (key, value) => { storage[key] = value; }};
  const items = Object.fromEntries(fields.map(field => [field.messageKey, {
    value: field.defaultValue, handlers: {},
    get() { return this.value; },
    set(value) { this.value = value; this.handlers.change?.(); },
    on(event, handler) { this.handlers[event] = handler; }
  }]));
  const reset = {on(event, handler) { this[event] = handler; }};
  custom.call({EVENTS: {AFTER_BUILD: 'build'}, on(event, handler) { handler(); },
    getItemByMessageKey: key => items[key], getItemById: () => reset});
  assert.equal(items.CURRENT_TEMP_COLOR.get(), 'ffffff');
  assert.equal(items.FUTURE_TEMP_COLOR.get(), 'ffaa00');
  items.THEME.set('1');
  assert.equal(items.CURRENT_TEMP_COLOR.get(), '000000');
  assert.equal(items.FUTURE_TEMP_COLOR.get(), 'ffaa00');
  items.CURRENT_TEMP_COLOR.set('0055aa');
  items.THEME.set('0');
  items.THEME.set('1');
  assert.equal(items.CURRENT_TEMP_COLOR.get(), '0055aa');
  reset.click();
  assert.equal(items.CURRENT_TEMP_COLOR.get(), '000000');
  delete global.localStorage;
});
