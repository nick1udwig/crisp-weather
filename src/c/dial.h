#pragma once
#include <stdbool.h>

// Reserve the trailing slots from the preceding quarter-hour position up to
// (but excluding) the current hour. At a cardinal hour the ring stays full.
static inline bool forecast_slot_is_tick(int hour, int ahead) {
  return ahead >= 12 - hour % 3;
}
