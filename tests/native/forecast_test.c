#include "pebble.h"
#include "../../src/c/forecast.h"
#include <assert.h>
#include <string.h>
static uint8_t stored[64];
static size_t stored_size;
Tuple *dict_find(DictionaryIterator *d, int key) {
  Tuple *t = key == 1 ? &d->start : key == 2 ? &d->data : key == 6 ? &d->fetched : &d->valid_until;
  return t->value ? t : NULL;
}
int persist_read_data(int key, void *out, size_t n) { memcpy(out,stored,n); return stored_size; }
int persist_write_data(int key, const void *in, size_t n) { memcpy(stored,in,n); stored_size=n; return n; }
int main(void) {
  int t,k;
  forecast_init(); assert(!forecast_get(100000,0,&t,&k));
  Value start={.int32=100000}, fetched={.int32=100000}, data={0};
  for (int i=0;i<24;i++) { data.data[2*i]=90+i; data.data[2*i+1]=i%7; }
  DictionaryIterator d={.start={TUPLE_INT,4,&start},.data={TUPLE_BYTE_ARRAY,48,&data},.fetched={TUPLE_INT,4,&fetched}};
  assert(forecast_receive(&d));
  assert(forecast_get(100000,0,&t,&k) && t==-10 && k==0);
  assert(!forecast_needs_refresh(101799));
  assert(forecast_needs_refresh(101800));
  assert(forecast_get(103600,0,&t,&k) && t==-9 && k==1);
  assert(forecast_get(103600,11,&t,&k) && t==2 && k==5);
  assert(!forecast_get(99999,0,&t,&k));
  assert(!forecast_get(110800,0,&t,&k));
  d.data.length=47; assert(!forecast_receive(&d));
  d.data.length=48; data.data[1]=9; assert(!forecast_receive(&d));
  forecast_init(); assert(forecast_get(100000,0,&t,&k) && k==0);
  data.data[0]=255; data.data[1]=7;
  assert(forecast_receive(&d));
  assert(!forecast_get(100000,0,&t,&k));
  assert(forecast_get(100000,1,&t,&k));
  data.data[0]=254; assert(!forecast_receive(&d));
  data.data[0]=90; assert(forecast_receive(&d));
  assert(!forecast_get(110800,0,&t,&k));
  fetched.int32=101000; assert(forecast_receive(&d));
  assert(forecast_get(110800,0,&t,&k));
  assert(!forecast_get(111800,0,&t,&k));
  Value expiry={.int32=101500};
  d.valid_until=(Tuple){TUPLE_INT,4,&expiry};
  assert(forecast_receive(&d));
  forecast_init(); assert(forecast_get(101499,0,&t,&k));
  assert(!forecast_get(101500,0,&t,&k)); assert(forecast_needs_refresh(101500));
  expiry.int32=100000; assert(!forecast_receive(&d));
  forecast_clear(); forecast_init(); assert(!forecast_get(101000,0,&t,&k));
  return 0;
}
