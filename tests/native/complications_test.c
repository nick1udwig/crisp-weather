#include <assert.h>
#include <string.h>
#include "../../src/c/complications.h"
static unsigned char storage[4][64];
static size_t sizes[4];
int persist_read_data(int key, void *out, size_t n) { memcpy(out,storage[key-50],n); return sizes[key-50]; }
int persist_write_data(int key, const void *data, size_t n) { memcpy(storage[key-50],data,n); sizes[key-50]=n; return n; }
Tuple *dict_find(DictionaryIterator *iter, int key) {
  if (key == MESSAGE_KEY_CORNER_SLOT) return &iter->corner_slot;
  if (key == MESSAGE_KEY_CORNER_TEXT) return &iter->corner_text;
  if (key == MESSAGE_KEY_CORNER_UNTIL) return &iter->corner_until;
  return NULL;
}
int main(void) {
  Value slot={.int32=1}, text={.cstring="72\xC2\xB0" "F"}, until={.int32=1700000300};
  DictionaryIterator iter={.corner_slot={TUPLE_INT,4,&slot},.corner_text={TUPLE_CSTRING,6,&text},.corner_until={TUPLE_INT,4,&until}};
  complications_init();
  assert(!strcmp(complications_text(1,1700000000),"--"));
  assert(complications_receive(&iter));
  assert(!strcmp(complications_text(1,1700000000),text.cstring));
  complications_init();
  assert(!strcmp(complications_text(1,1700000000),text.cstring));
  assert(!strcmp(complications_text(1,1700000300),"--"));
  assert(!strcmp(complications_text(1,1600000000),"--"));
  slot.int32=4; assert(!complications_receive(&iter)); slot.int32=1;
  iter.corner_text.length=30; assert(!complications_receive(&iter)); iter.corner_text.length=5;
  assert(!complications_receive(&iter)); iter.corner_text.length=6;
  iter.corner_until.type=TUPLE_CSTRING; assert(!complications_receive(&iter));
  complications_clear(1);
  assert(!strcmp(complications_text(1,1700000000),"--"));
  complications_init();
  assert(!strcmp(complications_text(1,1700000000),"--"));
}
