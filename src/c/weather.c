#include "weather.h"
#include <string.h>

#define WEATHER_PERSIST 42
static struct {
  int32_t low, high, rain;
  bool daily_valid, rain_valid;
} s_weather;

static bool read_int(DictionaryIterator *iter, uint32_t key, int32_t *value) {
  Tuple *t = dict_find(iter, key);
  if (!t || (t->type != TUPLE_INT && t->type != TUPLE_UINT)) return false;
  switch (t->length) {
    case 1: *value = t->type == TUPLE_INT ? t->value->int8 : t->value->uint8; break;
    case 2: *value = t->type == TUPLE_INT ? t->value->int16 : t->value->uint16; break;
    case 4: *value = t->value->int32; break;
    default: return false;
  }
  return true;
}

void weather_init(void) {
  if (persist_read_data(WEATHER_PERSIST, &s_weather, sizeof(s_weather)) != sizeof(s_weather))
    memset(&s_weather, 0, sizeof(s_weather));
}

bool weather_receive(DictionaryIterator *iter) {
  int32_t low, high, rain;
  bool changed = false;
  if (read_int(iter, MESSAGE_KEY_WEATHER_TEMP_MIN, &low) &&
      read_int(iter, MESSAGE_KEY_WEATHER_TEMP_MAX, &high) && low >= -100 && high <= 100 && low <= high) {
    s_weather.low = low;
    s_weather.high = high;
    s_weather.daily_valid = true;
    changed = true;
  }
  if (read_int(iter, MESSAGE_KEY_WEATHER_PRECIP, &rain) && rain >= 0 && rain <= 100) {
    s_weather.rain = rain;
    s_weather.rain_valid = true;
    changed = true;
  }
  if (changed) persist_write_data(WEATHER_PERSIST, &s_weather, sizeof(s_weather));
  return changed;
}

bool weather_daily(int *low, int *high) {
  if (!s_weather.daily_valid) return false;
  *low = s_weather.low;
  *high = s_weather.high;
  return true;
}

bool weather_rain(int *percent) {
  if (!s_weather.rain_valid) return false;
  *percent = s_weather.rain;
  return true;
}
