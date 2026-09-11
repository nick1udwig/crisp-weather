#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <time.h>
#define MESSAGE_KEY_FORECAST_START 1
#define MESSAGE_KEY_FORECAST_DATA 2
#define TUPLE_INT 1
#define TUPLE_UINT 2
#define TUPLE_BYTE_ARRAY 3
typedef union { int32_t int32; uint8_t data[48]; } Value;
typedef struct { int type; int length; Value *value; } Tuple;
typedef struct { Tuple start, data; } DictionaryIterator;
Tuple *dict_find(DictionaryIterator *, int);
int persist_read_data(int, void *, size_t);
int persist_write_data(int, const void *, size_t);

bool persist_exists(int);
bool persist_read_bool(int);
int32_t persist_read_int(int);
int persist_write_bool(int, bool);
int persist_write_int(int, int32_t);
