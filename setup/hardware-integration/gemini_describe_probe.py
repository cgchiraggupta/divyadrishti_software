#!/usr/bin/env python3
"""One-shot camera capture + Gemini describe probe (standalone).

Not imported by the sensing service until wired in Step 4.
Run without --speak to keep the glasses speaker off.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

from picamera2 import Picamera2

from gemini_describe import describe_frame


def capture_frame():
    print("[DESCRIBE] Initializing camera for one in-memory capture…", flush=True)
    camera = None
    try:
        camera = Picamera2()
        camera.configure(camera.create_still_configuration(main={"size": (320, 240)}))
        camera.start()
        time.sleep(2)
        frame = camera.capture_array()
        print(f"[DESCRIBE] Captured frame in memory: {frame.shape}", flush=True)
        return frame
    finally:
        if camera is not None:
            camera.stop()
            camera.close()
            print("[DESCRIBE] Camera released.", flush=True)


def speak(text: str) -> None:
    print("[DESCRIBE] Speaking description through glasses speaker…", flush=True)
    environment = {**os.environ, "AUDIODEV": "plughw:0,0"}
    subprocess.run(
        ["espeak", "-s", "140", "-v", "hi", text],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=environment,
        check=True,
    )
    print("[DESCRIBE] espeak completed.", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--speak", action="store_true", help="speak via glasses speaker (needs approval)")
    parser.add_argument("--no-image", action="store_true", help="omit jpeg in printed summary")
    parser.add_argument("--log-file", help="also write result text to this path (temp transport)")
    args = parser.parse_args()

    frame = capture_frame()
    result = describe_frame(frame, include_image=not args.no_image)
    text = result.get("text_hi") or ""
    status = result.get("status")
    source = result.get("source")

    print(f"[DESCRIBE] status={status} source={source}", flush=True)
    if status == "cooldown":
        print(f"[DESCRIBE] cooldown; retry_after_seconds={result.get('retry_after_seconds')}", flush=True)
    else:
        print(f"[DESCRIBE] text_hi: {text}", flush=True)

    if args.log_file:
        with open(args.log_file, "w", encoding="utf-8") as handle:
            handle.write(f"status={status}\nsource={source}\ntext_hi={text}\n")
        print(f"[DESCRIBE] Wrote result to {args.log_file}", flush=True)

    if args.speak and text and status == "ok":
        speak(text)
    else:
        print("[DESCRIBE] Speaker deliberately not activated (pass --speak after approval).", flush=True)

    return 0 if status in ("ok", "cooldown") else 1


if __name__ == "__main__":
    raise SystemExit(main())
