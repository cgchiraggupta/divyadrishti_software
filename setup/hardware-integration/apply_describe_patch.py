#!/usr/bin/env python3
"""Apply phone-first describe wiring to divya_drishti_final.py (idempotent)."""

from pathlib import Path
import re
import sys

TARGET = Path("/home/pi/divya_drishti_final.py")
text = TARGET.read_text(encoding="utf-8")
original = text

if "from gemini_describe import describe_frame" not in text:
    text = text.replace(
        "from picamera2 import Picamera2\n",
        "from picamera2 import Picamera2\nfrom gemini_describe import describe_frame\n",
        1,
    )

if "camera_lock =" not in text:
    text = text.replace(
        "state_lock = threading.Lock()\nmotor_lock = threading.Lock()\n",
        "state_lock = threading.Lock()\nmotor_lock = threading.Lock()\n"
        "camera_lock = threading.Lock()\n"
        "camera_holder = {\"picam2\": None}\n",
        1,
    )

old_post = '''        command = str(payload.get("command", "")).lower()
        if command not in ("pause", "resume"):
            self.send_json(400, {"error": "Unsupported command"})
            return
        with state_lock:
            state["paused"] = command == "pause"
        queue_event("voice_command", {"command": command, "source": "companion_app"})
        self.send_json(200, local_status_snapshot())
'''

new_post = '''        command = str(payload.get("command", "")).lower()
        if command not in ("pause", "resume", "describe"):
            self.send_json(400, {"error": "Unsupported command"})
            return

        if command == "describe":
            picam2 = camera_holder.get("picam2")
            if picam2 is None:
                self.send_json(503, {
                    "status": "error",
                    "text_hi": "Camera available nahi hai.",
                    "source": "fallback",
                })
                return
            try:
                with camera_lock:
                    frame = picam2.capture_array()
                result = describe_frame(frame, include_image=True)
            except Exception as error:
                print(f"[DESCRIBE] Failed: {error}")
                self.send_json(500, {
                    "status": "error",
                    "text_hi": "Abhi describe nahi ho paya. Thodi der baad phir try karein.",
                    "source": "fallback",
                })
                return
            queue_event("voice_command", {
                "command": "describe",
                "source": "companion_app",
                "status": result.get("status"),
            })
            self.send_json(200, result)
            return

        with state_lock:
            state["paused"] = command == "pause"
        queue_event("voice_command", {"command": command, "source": "companion_app"})
        self.send_json(200, local_status_snapshot())
'''

if "command == \"describe\"" not in text:
    if old_post not in text:
        print("ERROR: could not find /v1/command pause/resume block", file=sys.stderr)
        sys.exit(1)
    text = text.replace(old_post, new_post, 1)

old_capture = '''            if picam2 is not None:
                frame = picam2.capture_array()
                cv_densities = analyze_frame(frame)
'''

new_capture = '''            if picam2 is not None:
                with camera_lock:
                    frame = picam2.capture_array()
                cv_densities = analyze_frame(frame)
'''

if "with camera_lock:\n                    frame = picam2.capture_array()" not in text:
    if old_capture not in text:
        print("ERROR: could not find detection_loop camera capture", file=sys.stderr)
        sys.exit(1)
    text = text.replace(old_capture, new_capture, 1)

# Also lock the voice "photo" capture path if present
old_photo = '''                    fname = f"photo_{int(time.time())}.jpg"
                    frame = picam2.capture_array()
                    frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
'''
new_photo = '''                    fname = f"photo_{int(time.time())}.jpg"
                    with camera_lock:
                        frame = picam2.capture_array()
                    frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
'''
if old_photo in text and "with camera_lock:\n                        frame = picam2.capture_array()" not in text:
    text = text.replace(old_photo, new_photo, 1)

if 'camera_holder["picam2"] = picam2' not in text:
    text = text.replace(
        "    picam2 = init_camera()\n    if picam2 is not None:\n        speak(\"Camera ready.\")\n",
        "    picam2 = init_camera()\n    camera_holder[\"picam2\"] = picam2\n    if picam2 is not None:\n        speak(\"Camera ready.\")\n",
        1,
    )

if text == original:
    print("No changes needed (already patched).")
    sys.exit(0)

TARGET.write_text(text, encoding="utf-8")
print("Patched", TARGET)
print("Bytes:", len(original), "->", len(text))
