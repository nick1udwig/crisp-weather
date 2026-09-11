#include <assert.h>
#include <string.h>
#include "../../src/c/config.h"

static int32_t values[4096];
static bool exists[4096];
bool persist_exists(int key) { return exists[key]; }
bool persist_read_bool(int key) { return values[key] != 0; }
int32_t persist_read_int(int key) { return values[key]; }
int persist_write_int(int key, int32_t value) {
  exists[key] = true;
  values[key] = value;
  return 4;
}
int persist_write_bool(int key, bool value) { return persist_write_int(key, value); }

int main(void) {
  config_init();
  assert(config_get_bt_vibrate());
  // Turning off the indicator does not turn off vibration.
  persist_write_bool(PERSIST_KEY_BT, false);
  config_init();
  assert(config_get_bt_vibrate());
  // The opt-out survives settings reloads and retains the other settings.
  persist_write_bool(PERSIST_KEY_BT_VIBRATE, false);
  config_init();
  assert(!config_get_bt_vibrate());
  assert(config_get_temp_unit() == TEMP_UNIT_AUTO);
  assert(config_get_theme() == THEME_DARK);
  assert(config_get_color(PERSIST_KEY_CURRENT_TEMP_COLOR) == 0xFFFFFF);
  // Upgrade with an existing defaults flag and no vibration preference.
  memset(values, 0, sizeof(values));
  memset(exists, 0, sizeof(exists));
  persist_write_bool(PERSIST_DEFAULTS_SET, true);
  persist_write_int(PERSIST_KEY_THEME, THEME_LIGHT);
  config_init();
  assert(config_get_bt_vibrate());
  assert(config_get_color(PERSIST_KEY_CURRENT_TEMP_COLOR) == 0);
  assert(config_get_color(PERSIST_KEY_FUTURE_TEMP_COLOR) == 0xFFAA00);
}
