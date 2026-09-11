#include <assert.h>
#include "../../src/c/dial.h"

int main(void) {
  // Expected physical dial positions, explicitly covering all four quarters.
  const unsigned reserved[12] = {
    0, 1 << 0, (1 << 0) | (1 << 1),
    0, 1 << 3, (1 << 3) | (1 << 4),
    0, 1 << 6, (1 << 6) | (1 << 7),
    0, 1 << 9, (1 << 9) | (1 << 10)
  };
  for (int hour = 0; hour < 24; hour++) {
    unsigned actual = 0;
    assert(!forecast_slot_is_tick(hour, 0));
    for (int ahead = 0; ahead < 12; ahead++) {
      if (forecast_slot_is_tick(hour, ahead))
        actual |= 1 << ((hour + ahead) % 12);
    }
    assert(actual == reserved[hour % 12]);
  }
}
