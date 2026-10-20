#pragma once
#include <pebble.h>

void weather_init(void);
bool weather_receive(DictionaryIterator *iter);
bool weather_daily(time_t now, int *low, int *high);
bool weather_rain(time_t now, int *percent);
