#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <time.h>
#define MESSAGE_KEY_FORECAST_START 1
#define MESSAGE_KEY_FORECAST_DATA 2
#define MESSAGE_KEY_WEATHER_TEMP_MIN 3
#define MESSAGE_KEY_WEATHER_TEMP_MAX 4
#define MESSAGE_KEY_WEATHER_PRECIP 5
#define MESSAGE_KEY_WEATHER_FETCHED_AT 6
#define MESSAGE_KEY_WEATHER_DAILY_UNTIL 7
#define MESSAGE_KEY_WEATHER_RAIN_UNTIL 8
#define MESSAGE_KEY_WEATHER_REQUEST 9
#define TUPLE_INT 1
#define TUPLE_UINT 2
#define TUPLE_BYTE_ARRAY 3
typedef union { int8_t int8; uint8_t uint8; int16_t int16; uint16_t uint16; int32_t int32; uint32_t uint32; uint8_t data[48]; } Value;
typedef struct { int type; int length; Value *value; } Tuple;
typedef struct { Tuple start, data, low, high, rain, fetched, daily_until, rain_until; } DictionaryIterator;
Tuple *dict_find(DictionaryIterator *, int);
int persist_read_data(int, void *, size_t);
int persist_write_data(int, const void *, size_t);

bool persist_exists(int);
bool persist_read_bool(int);
int32_t persist_read_int(int);
int persist_write_bool(int, bool);
int persist_write_int(int, int32_t);

typedef int AppMessageResult;
#define APP_MSG_OK 0
#define APP_LOG_LEVEL_WARNING 1
#define APP_LOG(...) ((void)0)
void app_message_register_outbox_sent(void (*)(DictionaryIterator *, void *));
void app_message_register_outbox_failed(void (*)(DictionaryIterator *, AppMessageResult, void *));
bool connection_service_peek_pebble_app_connection(void);
AppMessageResult app_message_outbox_begin(DictionaryIterator **);
AppMessageResult app_message_outbox_send(void);
int dict_write_uint8(DictionaryIterator *, uint32_t, uint8_t);
