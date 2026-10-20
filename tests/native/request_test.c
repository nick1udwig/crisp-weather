#include "../../src/c/weather_request.h"
#include <assert.h>
static time_t clock_now=100000;
static bool connected=true, stale=true;
static int sends;
static uint8_t request;
static DictionaryIterator dictionary;
static void (*ack)(DictionaryIterator *, void *);
static void (*nack)(DictionaryIterator *, AppMessageResult, void *);
time_t time(time_t *t) { if(t) *t=clock_now; return clock_now; }
void app_message_register_outbox_sent(void (*fn)(DictionaryIterator *, void *)) { ack=fn; }
void app_message_register_outbox_failed(void (*fn)(DictionaryIterator *, AppMessageResult, void *)) { nack=fn; }
bool connection_service_peek_pebble_app_connection(void) { return connected; }
AppMessageResult app_message_outbox_begin(DictionaryIterator **iter) { *iter=&dictionary; return APP_MSG_OK; }
AppMessageResult app_message_outbox_send(void) { sends++; return APP_MSG_OK; }
int dict_write_uint8(DictionaryIterator *iter, uint32_t key, uint8_t value) { assert(key==9); request=value; return 0; }
bool forecast_needs_refresh(time_t now) { return stale; }
bool weather_daily(time_t now, int *low, int *high) { return !stale; }
bool weather_rain(time_t now, int *percent) { return !stale; }
int main(void) {
  weather_request_init();weather_request_check(false);assert(sends==1 && request==0);
  weather_request_check(true);assert(sends==1);ack(&dictionary,NULL);
  clock_now+=60;weather_request_check(false);assert(sends==1);
  clock_now+=240;weather_request_check(false);assert(sends==2);ack(&dictionary,NULL);
  stale=false;clock_now+=300;weather_request_check(false);assert(sends==2);
  clock_now+=1500;weather_request_check(false);assert(sends==3);ack(&dictionary,NULL);
  connected=false;weather_request_check(true);assert(sends==3);
  connected=true;weather_request_check(true);assert(sends==4 && request==1);
  nack(&dictionary,1,NULL);weather_request_check(false);assert(sends==4);
  clock_now-=3600;weather_request_check(false);assert(sends==5);
}
