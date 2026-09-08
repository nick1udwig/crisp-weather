#!/usr/bin/env python3
"""Inject illustrative weather into a running emulator; never used by the app."""
import datetime, json, os, subprocess, sys
platform = sys.argv[1] if len(sys.argv) > 1 else 'emery'
theme = sys.argv[2] if len(sys.argv) > 2 else 'dark'
if theme not in ('dark', 'light'):
    raise SystemExit('Theme must be dark or light')
# Run using the Python environment in which pebble-tool is installed.
keys = json.load(open('build/js/message_keys.json'))
start = int(datetime.datetime(2026, 9, 8, 10, tzinfo=datetime.timezone.utc).timestamp())
def run(*args):
    # The CLI normally resets the clock on every connection. Pin its emulator
    # connection to the fixture time so capture and injection use the same hour.
    wrapper = """
from pebble_tool.commands.base import PebbleTransportEmulator
from pebble_tool.commands.base import TimeMessage, SetUTC
from pebble_tool import run_tool
PebbleTransportEmulator.post_connect = classmethod(lambda cls, conn: conn.send_packet(
    TimeMessage(message=SetUTC(unix_time=%d, utc_offset=0, tz_name='UTC'))))
run_tool()
""" % (start + 480)
    subprocess.run([sys.executable, '-c', wrapper, *args, '--emulator', platform, '--vnc'], check=True)
run('emu-set-time', str(start + 8*60), '--utc')
temps = [19,20,22,23,22,20,18,17,16,15,14,13]*2
icons = [0,0,0,0,2,2,4,4,2,2,1,1]*2
raw = bytes(v for t,k in zip(temps,icons) for v in (t+100,k)).hex()
run('send-app-message', '--int', f'{keys["FORECAST_START"]}={start}',
    f'{keys["THEME"]}={int(theme == "light")}',
    f'{keys["TIPS_COLOR"]}={0x000000 if theme == "light" else 0xffffff}',
    f'{keys["HANDS_COLOR"]}={0x555555 if theme == "light" else 0xaaaaaa}',
    f'{keys["CALENDAR_DAY_COLOR"]}={0xaa5500 if theme == "light" else 0xffff55}',
    f'{keys["TEMP_UNIT"]}=1', f'{keys["WEATHER_TEMP_MIN"]}=13', f'{keys["WEATHER_TEMP_MAX"]}=23',
    '--bytes', f'{keys["FORECAST_DATA"]}={raw}')
run('screenshot', '--no-open', 'screenshots/'+platform+('-light' if theme == 'light' else '')+'.png')
