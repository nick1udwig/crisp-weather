#pragma once
#include "globals.h"
#define COMPLICATION_TEXT_SIZE 29
void complications_init(void);
bool complications_receive(DictionaryIterator *iter);
void complications_clear(int slot);
const char *complications_text(int slot, time_t now);
