#include "weather_request.h"
#include "forecast.h"
#include "weather.h"

static bool s_sending;
static time_t s_last_request;

static void sent(DictionaryIterator *iter, void *context) {
  s_sending = false;
}

static void failed(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  s_sending = false;
  APP_LOG(APP_LOG_LEVEL_WARNING, "Weather check delivery failed: %d", reason);
}

void weather_request_init(void) {
  app_message_register_outbox_sent(sent);
  app_message_register_outbox_failed(failed);
}

void weather_request_check(bool force) {
  if (s_sending || !connection_service_peek_pebble_app_connection()) return;
  time_t now = time(NULL);
  int low, high, rain;
  bool stale = forecast_needs_refresh(now) || !weather_daily(now, &low, &high) || !weather_rain(now, &rain);
  int interval = stale ? 300 : 1800;
  if (!force && s_last_request && now >= s_last_request && now - s_last_request < interval) return;
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) return;
  dict_write_uint8(iter, MESSAGE_KEY_WEATHER_REQUEST, force ? 1 : 0);
  s_sending = true;
  if (app_message_outbox_send() == APP_MSG_OK) s_last_request = now;
  else s_sending = false;
}
