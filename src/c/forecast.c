#include "forecast.h"
#include <string.h>
#define FORECAST_PERSIST 40
static struct { int32_t start; uint8_t data[FORECAST_HOURS * 2]; } s_forecast;
void forecast_init(void) {
  if (persist_read_data(FORECAST_PERSIST, &s_forecast, sizeof(s_forecast)) != sizeof(s_forecast))
    memset(&s_forecast, 0, sizeof(s_forecast));
}
bool forecast_receive(DictionaryIterator *iter) {
  Tuple *start = dict_find(iter, MESSAGE_KEY_FORECAST_START);
  Tuple *data = dict_find(iter, MESSAGE_KEY_FORECAST_DATA);
  if (!start || !data || start->length != 4 ||
      (start->type != TUPLE_INT && start->type != TUPLE_UINT) ||
      data->type != TUPLE_BYTE_ARRAY || data->length != sizeof(s_forecast.data)) return false;
  uint8_t bytes[FORECAST_HOURS * 2];
  memcpy(bytes, data->value->data, sizeof(bytes));
  for (int i = 0; i < FORECAST_HOURS; i++)
    if (bytes[i*2] > 200 || bytes[i*2+1] > 7) return false;
  s_forecast.start = start->value->int32;
  memcpy(s_forecast.data, data->value->data, sizeof(s_forecast.data));
  persist_write_data(FORECAST_PERSIST, &s_forecast, sizeof(s_forecast));
  return true;
}
bool forecast_get(time_t now, int ahead, int *temp, int *icon) {
  // Expire after three hours without an update; never rotate old weather into tomorrow.
  if (!s_forecast.start || now < s_forecast.start || now - s_forecast.start >= 3*3600) return false;
  int i = (now - s_forecast.start) / 3600 + ahead;
  if (i < 0 || i >= FORECAST_HOURS) return false;
  *temp = s_forecast.data[i*2] - 100;
  *icon = s_forecast.data[i*2+1];
  return true;
}
