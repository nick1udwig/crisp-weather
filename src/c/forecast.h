#pragma once
#include <pebble.h>
#define FORECAST_HOURS 24
// sun, moon, cloud, fog, rain, snow, storm, unknown
void forecast_init(void);
bool forecast_receive(DictionaryIterator *iter);
bool forecast_get(time_t now, int ahead, int *temp, int *icon);
