#include "complications.h"
#include <string.h>
#define COMPLICATION_PERSIST 50
static struct { int32_t until; char text[COMPLICATION_TEXT_SIZE]; } s_slots[NUM_CORNERS];
void complications_init(void) {
  for (int i = 0; i < NUM_CORNERS; i++) {
    if (persist_read_data(COMPLICATION_PERSIST+i, &s_slots[i], sizeof(s_slots[i])) != sizeof(s_slots[i]))
      memset(&s_slots[i], 0, sizeof(s_slots[i]));
    s_slots[i].text[COMPLICATION_TEXT_SIZE-1] = '\0';
  }
}
void complications_clear(int slot) {
  if (slot < 0 || slot >= NUM_CORNERS) return;
  memset(&s_slots[slot], 0, sizeof(s_slots[slot]));
  persist_write_data(COMPLICATION_PERSIST+slot, &s_slots[slot], sizeof(s_slots[slot]));
}
bool complications_receive(DictionaryIterator *iter) {
  Tuple *slot = dict_find(iter, MESSAGE_KEY_CORNER_SLOT);
  Tuple *until = dict_find(iter, MESSAGE_KEY_CORNER_UNTIL);
  Tuple *text = dict_find(iter, MESSAGE_KEY_CORNER_TEXT);
  if (!slot || !until || !text || slot->length != 4 || until->length != 4 ||
      (slot->type != TUPLE_INT && slot->type != TUPLE_UINT) ||
      (until->type != TUPLE_INT && until->type != TUPLE_UINT) ||
      text->type != TUPLE_CSTRING || text->length < 1 || text->length > COMPLICATION_TEXT_SIZE) return false;
  char value[COMPLICATION_TEXT_SIZE];
  memcpy(value, text->value, text->length);
  if (value[text->length-1] != '\0') return false;
  int i = slot->value->int32;
  if (i < 0 || i >= NUM_CORNERS || until->value->int32 < 0) return false;
  s_slots[i].until = until->value->int32;
  memcpy(s_slots[i].text, value, text->length);
  persist_write_data(COMPLICATION_PERSIST+i, &s_slots[i], sizeof(s_slots[i]));
  return true;
}
const char *complications_text(int slot, time_t now) {
  if (slot < 0 || slot >= NUM_CORNERS || !s_slots[slot].until || now >= s_slots[slot].until ||
      now < s_slots[slot].until - 86400) return "--";
  return s_slots[slot].text;
}
