#include "weather.h"
#include <string.h>

#define WEATHER_PERSIST 42
static struct {
  int32_t low, high, rain;
  int32_t daily_until, rain_until;
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
  int32_t low, high, rain, until;
  bool changed = false;
  if (read_int(iter, MESSAGE_KEY_WEATHER_TEMP_MIN, &low) &&
      read_int(iter, MESSAGE_KEY_WEATHER_TEMP_MAX, &high) &&
      read_int(iter, MESSAGE_KEY_WEATHER_DAILY_UNTIL, &until) && until > 0 && low >= -100 && high <= 100 && low <= high) {
    s_weather.low = low;
    s_weather.high = high;
    s_weather.daily_until = until;
    changed = true;
  }
  if (read_int(iter, MESSAGE_KEY_WEATHER_PRECIP, &rain) &&
      read_int(iter, MESSAGE_KEY_WEATHER_RAIN_UNTIL, &until) && until > 0 && rain >= 0 && rain <= 100) {
    s_weather.rain = rain;
    s_weather.rain_until = until;
    changed = true;
  }
  if (changed) persist_write_data(WEATHER_PERSIST, &s_weather, sizeof(s_weather));
  return changed;
}

bool weather_daily(time_t now, int *low, int *high) {
  if (!s_weather.daily_until || now < s_weather.daily_until - 86400 || now >= s_weather.daily_until) return false;
  *low = s_weather.low;
  *high = s_weather.high;
  return true;
}

bool weather_rain(time_t now, int *percent) {
  if (!s_weather.rain_until || now < s_weather.rain_until - 3600 || now >= s_weather.rain_until) return false;
  *percent = s_weather.rain;
  return true;
}
