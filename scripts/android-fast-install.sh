#!/usr/bin/env bash
# Fast phone install for JS/UI changes only (~20–40s when Gradle is warm).
# Skips: gradle clean, daemon stop, full Capacitor native sync.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHONE_SERIAL="${ADB_SERIAL:-0015935A7000905}"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
PUBLIC="$ROOT/android/app/src/main/assets/public"

cd "$ROOT"

if ! adb -s "$PHONE_SERIAL" get-state >/dev/null 2>&1; then
  echo "Phone $PHONE_SERIAL not connected. Plug it in (USB debugging on)."
  adb devices -l
  exit 1
fi

echo "==> vite build"
npx vite build --logLevel warn

echo "==> sync web assets into Android (rsync, no full cap sync)"
mkdir -p "$PUBLIC"
rsync -a --delete "$ROOT/dist/" "$PUBLIC/"

echo "==> gradle assembleDebug (incremental)"
cd "$ROOT/android"
./gradlew assembleDebug -q

echo "==> adb install -r"
adb -s "$PHONE_SERIAL" install -r "$APK"

echo "OK — installed on $PHONE_SERIAL"
