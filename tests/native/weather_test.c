#include "../../src/c/weather.h"
#include <assert.h>
#include <string.h>
static uint8_t stored[64];
static size_t stored_size;
Tuple *dict_find(DictionaryIterator *d, int key) {
  Tuple *t = key == 3 ? &d->low : key == 4 ? &d->high : key == 5 ? &d->rain : key == 7 ? &d->daily_until : &d->rain_until;
  return t->value ? t : NULL;
}
int persist_read_data(int key, void *out, size_t n) { memcpy(out,stored,n); return stored_size; }
int persist_write_data(int key, const void *in, size_t n) { memcpy(stored,in,n); stored_size=n; return n; }
int main(void) {
  int lo, hi, rain;
  weather_init(); assert(!weather_daily(100000,&lo,&hi)); assert(!weather_rain(100000,&rain));
  Value low={.int32=-5}, high={.int32=10}, wet={.int32=70}, day_end={.int32=180000}, rain_end={.int32=103000};
  DictionaryIterator d={.low={TUPLE_INT,4,&low},.high={TUPLE_INT,4,&high},.daily_until={TUPLE_INT,4,&day_end}};
  assert(weather_receive(&d)); assert(weather_daily(100000,&lo,&hi) && lo==-5 && hi==10);
  assert(!weather_rain(100000,&rain));
  d=(DictionaryIterator){.rain={TUPLE_INT,4,&wet},.rain_until={TUPLE_INT,4,&rain_end}};
  assert(weather_receive(&d)); assert(weather_daily(100000,&lo,&hi)); assert(weather_rain(100000,&rain) && rain==70);
  assert(!weather_daily(180000,&lo,&hi));
  assert(!weather_rain(103000,&rain));
  assert(!weather_rain(90000,&rain));
  wet.int32=101; assert(!weather_receive(&d));
  weather_init(); assert(weather_daily(100000,&lo,&hi)); assert(weather_rain(100000,&rain) && rain==70);
}
