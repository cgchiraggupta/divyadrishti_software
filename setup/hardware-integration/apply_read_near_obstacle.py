#!/usr/bin/env python3
"""Wire near-range obstacle Gemini + read command alias."""

from pathlib import Path
from datetime import datetime

TARGET = Path("/home/pi/divya_drishti_final.py")
text = TARGET.read_text(encoding="utf-8")
Path(f"/home/pi/divya_drishti_final.py.bak-before-read-near-{datetime.now():%Y%m%d-%H%M%S}").write_text(text)

old_worker = '''def obstacle_phone_guidance_worker(frame, direction, distance_mm, event_type, image_jpeg_b64="", alert_id=None):
    """Background: Gemini labels obstacle; phone already has the photo from instant pass."""
    try:
        result = describe_obstacle(frame, direction=direction, distance_mm=distance_mm)
'''

new_worker = '''def obstacle_phone_guidance_worker(frame, direction, distance_mm, event_type, image_jpeg_b64="", alert_id=None):
    """Background: Gemini labels NEAR obstacle only; phone already has the photo."""
    try:
        max_range_mm = runtime_settings_snapshot().get("sensitivity_mm", 2500)
        result = describe_obstacle(
            frame,
            direction=direction,
            distance_mm=distance_mm,
            max_range_mm=max_range_mm,
        )
'''

if old_worker not in text:
    raise SystemExit("worker head missing")
text = text.replace(old_worker, new_worker, 1)

# Accept read as alias; publish kind read
text = text.replace(
    'if command not in ("pause", "resume", "describe", "unmute_haptics"):',
    'if command not in ("pause", "resume", "describe", "read", "unmute_haptics"):',
    1,
)
text = text.replace(
    '        if command == "describe":\n',
    '        if command in ("describe", "read"):\n',
    1,
)
text = text.replace(
    '''            if result.get("status") == "ok" and result.get("text_hi"):
                publish_phone_alert({
                    "kind": "describe",
                    "event_type": "voice_command",
                    "speak_hi": result["text_hi"],
                    "text_hi": result["text_hi"],
                    "image_jpeg_b64": result.get("image_jpeg_b64") or "",
                    "source": result.get("source"),
                })
''',
    '''            if result.get("status") == "ok" and result.get("text_hi"):
                publish_phone_alert({
                    "kind": "read",
                    "event_type": "voice_command",
                    "speak_hi": result["text_hi"],
                    "text_hi": result["text_hi"],
                    "image_jpeg_b64": result.get("image_jpeg_b64") or "",
                    "source": result.get("source"),
                    "speak": False,
                })
''',
    1,
)
text = text.replace(
    '''            queue_event("voice_command", {
                "command": "describe",
                "source": "companion_app",
                "status": result.get("status"),
                "speak_hi": result.get("text_hi"),
            })
''',
    '''            queue_event("voice_command", {
                "command": "read",
                "source": "companion_app",
                "status": result.get("status"),
                "speak_hi": result.get("text_hi"),
            })
''',
    1,
)

# Skip Gemini speak for range_skip / cooldown statuses
old_ready = '''        text_hi = (result.get("text_hi") or "").strip()
        if not text_hi:
            return
        payload = {
            "kind": "obstacle",
'''
new_ready = '''        if result.get("status") in ("cooldown", "skipped"):
            return
        text_hi = (result.get("text_hi") or "").strip()
        if not text_hi:
            return
        payload = {
            "kind": "obstacle",
'''
if old_ready not in text:
    raise SystemExit("worker result handling missing")
text = text.replace(old_ready, new_ready, 1)

TARGET.write_text(text)
print("patched main script")
