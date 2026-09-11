# Crisp Weather

A Pebble watchface based on [Michal Bláha’s Crisp](https://github.com/michalblaha/Crisp-watchface), with a forecast around the analog dial. The original two-tone hands, right-side date, themes, and configurable readouts are retained. Round watches use the day number and compact interior readouts to leave room for the ring.

- Experimental: the trailing forecast slots back to the preceding 12/3/6/9 position become Crisp ticks (10 → tick at 9; 11 → ticks at 9 and 10; cardinal hours → no reserved ticks).
- Twelve forecast slots replace the ticks: the current hour and the next eleven hours, clockwise. At 10:08, the 3 o’clock position is the forecast for 15:00.
- Four short minute ticks appear in the active five-minute section (for example, minutes 6–9 at 10:08), advancing with the minute hand.
- The current hour always shows its temperature in the dial, even when its weather changes. On color watches, current-hour temperatures default to black on light themes and white on dark themes; future temperatures default to amber. Both colors are configurable per theme. Its weather icon sits at the hour-hand tip, following the hand through its launch animation too.
- Each future slot shows an icon instead of its temperature when the visual weather category changes; otherwise it shows a temperature without a degree symbol. Clear day/night, cloud, fog, rain, snow, thunderstorm, and unknown conditions have distinct symbols. Partly cloudy and overcast share the cloud icon; precipitation intensities share their category.
- The phone fetches 24 hourly samples every 30 minutes from [Open-Meteo](https://open-meteo.com/en/docs), using location permission. No API key is required. The ring advances locally each hour and caches across restarts. Before weather arrives, and after three hours without a fresh forecast, it restores Crisp’s original ticks, hand lengths, date placement, and corner layout.
- Vibration on Bluetooth disconnect is enabled by default and can be disabled independently of the visual disconnect indicator.
- Temperature units follow the existing Auto / Celsius / Fahrenheit setting. The lower-right weather corner remains the daily low/high.

Sun/moon/storm accents use yellow on dark backgrounds and dark amber on light backgrounds; rain uses cyan or dark blue respectively. Monochrome icons follow the theme foreground.

The icon at the hour hand represents the **current hourly forecast**, not a live observation. Weather changes have hourly precision. On first launch, the face looks like Crisp until the phone supplies weather. The corner low/high retains Crisp’s last received daily values independently of ring expiry.

## Build and test

Install the [Pebble SDK](https://developer.repebble.com/sdk/), then:

```sh
npm install
npm test
pebble build
pebble install --emulator emery
pebble screenshot --no-open --emulator emery
```

The bundle is `build/pebble-face.pbw`. Targets: aplite, basalt, chalk, diorite, emery, flint, and gabbro. The new UUID allows installation alongside Crisp.

The layout is a first pass; compact displays and adjacent condition changes should be reviewed on a physical watch. Date placement and hand lengths are moved inward to make room for the forecast ring. The obsolete battery-on-markers control is removed; battery remains available in any corner.

Upstream source and resources retain their original authorship. See [UPSTREAM.md](UPSTREAM.md) for the source revision.

## Development checks

The forecast parser tests run with `npm test`. The native cache test exercises the actual C receiver, hourly advancement, expiry, malformed packets, and persistence:

```sh
cc -Itests/native -o /tmp/crisp-forecast-test tests/native/forecast_test.c src/c/forecast.c
/tmp/crisp-forecast-test
```

To reproduce the illustrative 10:08 forecast, install on the emulator, then run `python scripts/preview.py emery dark` (or `light`) using the Python environment containing `pebble-tool`. This pins only the emulator clock and injects fixture data; production builds always request real weather. Screenshots under `screenshots/` use illustrative data.

Validation: built with Pebble SDK 4.33.1 for all seven targets; forecast parser and native cache tests pass. Emulator previews cover emery, chalk, and aplite. Phone geolocation and live weather delivery have not been tested on physical hardware.

Latest dial revision: verified both dark and light themes on emery (`screenshots/emery.png` and `screenshots/emery-light.png`). The chalk and aplite screenshots show the earlier layout.
