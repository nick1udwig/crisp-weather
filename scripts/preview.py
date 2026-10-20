"""Capture the production watch renderer with fixed fixture weather and no HTTP requests."""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PLATFORMS = json.loads((ROOT / "package.json").read_text())["pebble"]["targetPlatforms"]
START = int(datetime.datetime(2026, 9, 8, 9, tzinfo=datetime.timezone.utc).timestamp())
NOW = START + 8 * 60
KEYS = json.loads((ROOT / "build/js/message_keys.json").read_text())


def run(platform, *args):
    wrapper = f"""
from pebble_tool.commands.base import PebbleTransportEmulator, TimeMessage, SetUTC
from pebble_tool import run_tool
PebbleTransportEmulator.post_connect = classmethod(lambda cls, conn: conn.send_packet(
    TimeMessage(message=SetUTC(unix_time={NOW}, utc_offset=0, tz_name='UTC'))))
run_tool()
"""
    subprocess.run([sys.executable, "-c", wrapper, *args, "--emulator", platform, "--vnc"], cwd=ROOT, check=True)


def send(platform, fields, raw=None):
    args = ["send-app-message", "--int", *(f"{KEYS[key]}={value}" for key, value in fields.items())]
    if raw is not None:
        args.extend(["--bytes", f"{KEYS['FORECAST_DATA']}={raw.hex()}"])
    run(platform, *args)


def capture(platform, theme, partial, output):
    light = theme == "light"
    settings = {
        "DATE": 1, "DAY": 1, "SECOND_HAND": 0, "HR_INDICATOR": 1, "BT": 1, "BT_VIBRATE": 1,
        "THEME": int(light), "TEMP_UNIT": 1, "CORNER_TL": 1, "CORNER_TR": 3, "CORNER_BL": 4, "CORNER_BR": 5,
        "HOUR_MARKERS_COLOR": 0x000000 if light else 0xFFFFFF,
        "MINUTE_MARKERS_COLOR": 0x555555 if light else 0xAAAAAA,
        "CHARGING_MARKERS_COLOR": 0x00AA00 if light else 0x00FF00,
        "CURRENT_TEMP_COLOR": 0x000000 if light else 0xFFFFFF, "FUTURE_TEMP_COLOR": 0xFFAA00,
        "TIPS_COLOR": 0x000000 if light else 0xFFFFFF,
        "HANDS_COLOR": 0x555555 if light else 0xAAAAAA,
        "SECOND_HAND_COLOR": 0xFF0000 if light else 0xAA0000,
        "SECOND_TIP_COLOR": 0xFF5500 if light else 0xFFFF00,
        "CALENDAR_DAY_COLOR": 0xAA5500 if light else 0xFFFF55,
    }
    send(platform, settings)
    temps = [19, 20, 22, 23, 22, 20, 18, 17, 16, 15, 14, 13] * 2
    icons = [0, 0, 0, 0, 2, 2, 4, 4, 2, 2, 1, 1] * 2
    raw = bytearray(v for temp, icon in zip(temps, icons) for v in (temp + 100, icon))
    if partial:
        raw[4] = 255
        raw[11] = 7
    send(platform, {"FORECAST_START": START, "WEATHER_FETCHED_AT": NOW,
                    "WEATHER_TEMP_MIN": 13, "WEATHER_TEMP_MAX": 23,
                    "WEATHER_DAILY_UNTIL": (NOW // 86400 + 1) * 86400,
                    "WEATHER_PRECIP": 40, "WEATHER_RAIN_UNTIL": START + 3600}, raw)
    destination = output or ROOT / "screenshots" / f"{platform}{'-light' if light else ''}.png"
    run(platform, "screenshot", "--no-open", str(destination))
    print(f"Captured {platform} {theme}: {destination}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", nargs="?", default="emery", choices=PLATFORMS)
    parser.add_argument("theme", nargs="?", default="dark", choices=["dark", "light"])
    parser.add_argument("--all", action="store_true", help="Capture both themes on all platforms")
    parser.add_argument("--partial", action="store_true", help="Include a missing temperature and unknown conditions")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.all and (args.output or args.partial):
        parser.error("--all cannot be combined with --output or --partial")
    with tempfile.TemporaryDirectory(prefix="crisp-preview-") as temporary:
        bundle = Path(temporary) / "preview.pbw"
        with zipfile.ZipFile(ROOT / "build/crisp-weather.pbw") as source, zipfile.ZipFile(bundle, "w") as target:
            for entry in source.infolist():
                data = b"Pebble.addEventListener('ready',function(){});" if entry.filename == "pebble-js-app.js" else source.read(entry.filename)
                target.writestr(entry, data)
        for platform in PLATFORMS if args.all else [args.platform]:
            run(platform, "install", str(bundle))
            run(platform, "emu-battery", "--percent", "100")
            for theme in ["dark", "light"] if args.all else [args.theme]:
                capture(platform, theme, args.partial, args.output)


if __name__ == "__main__":
    main()
