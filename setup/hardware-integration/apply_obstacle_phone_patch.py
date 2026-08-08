#!/usr/bin/env python3
"""Wire obstacle→Gemini→phone alert + haptics mute during describe."""

from pathlib import Path
import sys

TARGET = Path("/home/pi/divya_drishti_final.py")
text = TARGET.read_text(encoding="utf-8")
original = text

# --- imports ---
text = text.replace(
    "from gemini_describe import describe_frame, frame_to_jpeg_bytes\n",
    "from gemini_describe import describe_frame, describe_obstacle, frame_to_jpeg_bytes\n",
)

# --- shared state for phone guidance + haptics mute ---
if "pending_phone_alert" not in text:
    text = text.replace(
        'camera_holder = {"picam2": None}\n',
        'camera_holder = {"picam2": None}\n'
        'pending_phone_alert = {"id": 0, "payload": None}\n'
        'pending_phone_lock = threading.Lock()\n',
        1,
    )

if '"haptics_muted"' not in text:
    text = text.replace(
        '    "mic_ok":          True,\n',
        '    "mic_ok":          True,\n'
        '    "haptics_muted":   False,\n',
        1,
    )

# --- helpers ---
HELPERS = '''
def set_haptics_muted(muted):
    with state_lock:
        state["haptics_muted"] = bool(muted)


def publish_phone_alert(payload):
    """Make one guidance payload available for the companion app to speak."""
    with pending_phone_lock:
        pending_phone_alert["id"] = int(pending_phone_alert.get("id") or 0) + 1
        pending_phone_alert["payload"] = {
            **payload,
            "alert_id": pending_phone_alert["id"],
            "created_at": utc_now(),
        }
        snapshot = dict(pending_phone_alert["payload"])
    return snapshot


def obstacle_phone_guidance_worker(frame, direction, distance_mm, event_type):
    """Background: Gemini labels obstacle, then phone can speak it."""
    try:
        result = describe_obstacle(frame, direction=direction, distance_mm=distance_mm)
        text_hi = (result.get("text_hi") or "").strip()
        if not text_hi:
            return
        payload = {
            "kind": "obstacle",
            "event_type": event_type,
            "direction": direction,
            "distance_mm": distance_mm,
            "speak_hi": text_hi,
            "text_hi": text_hi,
            "image_jpeg_b64": result.get("image_jpeg_b64") or "",
            "source": result.get("source"),
        }
        publish_phone_alert(payload)
        # Cloud/history event without huge image if possible — keep speak text.
        queue_event(event_type, {
            "distance_mm": distance_mm,
            "direction": direction,
            "message": text_hi,
            "speak_hi": text_hi,
            "object_label": text_hi,
            "gemini": True,
        })
        print(f"[DESCRIBE] Obstacle phone alert ready ({result.get('source')})")
    except Exception as error:
        print(f"[DESCRIBE] Obstacle guidance failed: {error}")

'''

if "def publish_phone_alert" not in text:
    text = text.replace(
        "def local_status_snapshot():\n",
        HELPERS + "def local_status_snapshot():\n",
        1,
    )

# --- local status includes pending phone alert ---
old_status = '''def local_status_snapshot():
    with state_lock:
        return {
            "device_id": state["device_id"],
            "available": True,
            "paused": state["paused"],
            "last_scene": state["last_scene"],
            "tof_left_ok": state["tof_left_ok"],
            "tof_right_ok": state["tof_right_ok"],
            "camera_ok": state["camera_ok"],
            "mic_ok": state["mic_ok"],
            "updated_at": utc_now(),
        }
'''
new_status = '''def local_status_snapshot():
    with state_lock:
        snapshot = {
            "device_id": state["device_id"],
            "available": True,
            "paused": state["paused"],
            "haptics_muted": state.get("haptics_muted", False),
            "last_scene": state["last_scene"],
            "tof_left_ok": state["tof_left_ok"],
            "tof_right_ok": state["tof_right_ok"],
            "camera_ok": state["camera_ok"],
            "mic_ok": state["mic_ok"],
            "updated_at": utc_now(),
        }
    with pending_phone_lock:
        snapshot["phone_alert"] = pending_phone_alert.get("payload")
    return snapshot
'''
if '"phone_alert"' not in text:
    if old_status not in text:
        print("ERROR: local_status_snapshot block missing", file=sys.stderr)
        sys.exit(1)
    text = text.replace(old_status, new_status, 1)

# --- describe: mute haptics, publish phone alert ---
old_describe = '''        if command == "describe":
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
'''
new_describe = '''        if command == "describe":
            picam2 = camera_holder.get("picam2")
            if picam2 is None:
                self.send_json(503, {
                    "status": "error",
                    "text_hi": "Camera available nahi hai.",
                    "source": "fallback",
                })
                return
            set_haptics_muted(True)
            try:
                with camera_lock:
                    frame = picam2.capture_array()
                result = describe_frame(frame, include_image=True)
            except Exception as error:
                print(f"[DESCRIBE] Failed: {error}")
                set_haptics_muted(False)
                self.send_json(500, {
                    "status": "error",
                    "text_hi": "Abhi describe nahi ho paya. Thodi der baad phir try karein.",
                    "source": "fallback",
                    "error": str(error),
                })
                return
            if result.get("status") == "ok" and result.get("text_hi"):
                publish_phone_alert({
                    "kind": "describe",
                    "event_type": "voice_command",
                    "speak_hi": result["text_hi"],
                    "text_hi": result["text_hi"],
                    "image_jpeg_b64": result.get("image_jpeg_b64") or "",
                    "source": result.get("source"),
                })
            # Keep motors quiet while phone speaks; companion can resume via resume/describe-done.
            # Auto-unmute after 20s as a safety net.
            def _unmute_later():
                time.sleep(20)
                set_haptics_muted(False)
            threading.Thread(target=_unmute_later, daemon=True).start()
            queue_event("voice_command", {
                "command": "describe",
                "source": "companion_app",
                "status": result.get("status"),
                "speak_hi": result.get("text_hi"),
            })
            self.send_json(200, result)
            return
'''
if "set_haptics_muted(True)" not in text:
    if old_describe not in text:
        print("ERROR: describe block missing", file=sys.stderr)
        sys.exit(1)
    text = text.replace(old_describe, new_describe, 1)

# Accept unmute command from phone after speech
if '"unmute_haptics"' not in text:
    text = text.replace(
        'if command not in ("pause", "resume", "describe"):',
        'if command not in ("pause", "resume", "describe", "unmute_haptics"):',
        1,
    )
    text = text.replace(
        '        with state_lock:\n            state["paused"] = command == "pause"\n        queue_event("voice_command", {"command": command, "source": "companion_app"})\n        self.send_json(200, local_status_snapshot())\n',
        '        if command == "unmute_haptics":\n'
        '            set_haptics_muted(False)\n'
        '            self.send_json(200, local_status_snapshot())\n'
        '            return\n\n'
        '        with state_lock:\n'
        '            state["paused"] = command == "pause"\n'
        '            if command == "resume":\n'
        '                state["haptics_muted"] = False\n'
        '        queue_event("voice_command", {"command": command, "source": "companion_app"})\n'
        '        self.send_json(200, local_status_snapshot())\n',
        1,
    )

# --- deliver_alert respects haptics_muted ---
old_deliver = '''def deliver_alert(side, pattern, message):
    """Use the confirmed runtime feedback settings for future guidance only."""
    settings = runtime_settings_snapshot()
    feedback_mode = settings["feedback_mode"]
    if message and feedback_mode in ("audio", "both"):
        speak(message, volume=settings["volume"])
    if side and pattern and feedback_mode in ("vibration", "both"):
        vibrate_pattern(side, pattern, settings["vibration_intensity"])
'''
new_deliver = '''def deliver_alert(side, pattern, message):
    """Use the confirmed runtime feedback settings for future guidance only."""
    settings = runtime_settings_snapshot()
    feedback_mode = settings["feedback_mode"]
    with state_lock:
        haptics_muted = state.get("haptics_muted", False)
    # Glasses speaker is weak — still attempt audio if configured, but never
    # vibrate while the phone is speaking a describe/read result.
    if message and feedback_mode in ("audio", "both") and not haptics_muted:
        speak(message, volume=settings["volume"])
    if side and pattern and feedback_mode in ("vibration", "both") and not haptics_muted:
        vibrate_pattern(side, pattern, settings["vibration_intensity"])
'''
if "haptics_muted = state.get" not in text:
    if old_deliver not in text:
        print("ERROR: deliver_alert block missing", file=sys.stderr)
        sys.exit(1)
    text = text.replace(old_deliver, new_deliver, 1)

# --- on should_alert: start Gemini worker (keep immediate haptic) ---
old_alert = '''                if should_alert:
                    announcement = message if message != last_alert_message else None
                    event_detail = {
                        "distance_mm": distance_mm,
                        "direction": "ahead" if side == "both" else side,
                        "message": message,
                    }
                    if frame is not None:
                        try:
                            jpeg = frame_to_jpeg_bytes(frame, quality=55)
                            event_detail["image_jpeg_b64"] = base64.b64encode(jpeg).decode("ascii")
                        except Exception as snap_error:
                            print(f"[CAMERA] Obstacle snapshot skipped: {snap_error}")
                    threading.Thread(target=deliver_alert, args=(side, pattern, announcement)).start()
                    queue_event(event_type, event_detail)
'''
new_alert = '''                if should_alert:
                    announcement = message if message != last_alert_message else None
                    direction = "ahead" if side == "both" else side
                    event_detail = {
                        "distance_mm": distance_mm,
                        "direction": direction,
                        "message": message,
                    }
                    frame_copy = None
                    if frame is not None:
                        try:
                            jpeg = frame_to_jpeg_bytes(frame, quality=55)
                            event_detail["image_jpeg_b64"] = base64.b64encode(jpeg).decode("ascii")
                            frame_copy = frame.copy()
                        except Exception as snap_error:
                            print(f"[CAMERA] Obstacle snapshot skipped: {snap_error}")
                    threading.Thread(target=deliver_alert, args=(side, pattern, announcement)).start()
                    queue_event(event_type, event_detail)
                    if frame_copy is not None:
                        threading.Thread(
                            target=obstacle_phone_guidance_worker,
                            args=(frame_copy, direction, distance_mm, event_type),
                            daemon=True,
                        ).start()
'''
if "obstacle_phone_guidance_worker" not in text or "frame_copy = None" not in text:
    if old_alert not in text:
        # maybe partially patched
        if "obstacle_phone_guidance_worker" in text:
            print("Obstacle worker already present")
        else:
            print("ERROR: should_alert block missing", file=sys.stderr)
            sys.exit(1)
    else:
        text = text.replace(old_alert, new_alert, 1)

if text == original:
    print("No changes needed")
else:
    TARGET.write_text(text, encoding="utf-8")
    print("Patched", TARGET, "bytes", len(original), "->", len(text))
