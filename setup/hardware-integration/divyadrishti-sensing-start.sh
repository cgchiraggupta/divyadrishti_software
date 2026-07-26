#!/usr/bin/env bash
set -euo pipefail

# The Pi Zero W has one Wi-Fi radio. Do not run the sensing application while
# it is exposing the temporary setup hotspot: wait for normal client Wi-Fi.
INTERFACE=wlan0

until ip route | grep -q "^default.*$INTERFACE"; do
  sleep 3
done

exec /usr/bin/python3 /home/pi/divya_drishti_final.py
