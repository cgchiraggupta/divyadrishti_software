#!/usr/bin/env python3
"""Instant obstacle photo pass to phone + alert queue (don't wait for Gemini)."""

from pathlib import Path
from datetime import datetime

TARGET = Path("/home/pi/divya_drishti_final.py")
text = TARGET.read_text(encoding="utf-8")
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
Path(f"/home/pi/divya_drishti_final.py.bak-before-fast-pass-{stamp}").write_text(text)

text = text.replace(
    'pending_phone_alert = {"id": 0, "payload": None}\n',
    'pending_phone_alert = {"id": 0, "payload": None, "queue": []}\n',
    1,
)

old_pub = '''def publish_phone_alert(payload):
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

new_pub = '''def publish_phone_alert(payload):
    """Queue a guidance payload for the companion app (photo + optional speak)."""
    with pending_phone_lock:
        pending_phone_alert["id"] = int(pending_phone_alert.get("id") or 0) + 1
        item = {
            **payload,
            "alert_id": pending_phone_alert["id"],
            "created_at": utc_now(),
        }
        pending_phone_alert["payload"] = item
        queue = pending_phone_alert.setdefault("queue", [])
        queue.append(item)
        if len(queue) > 8:
            del queue[:-8]
        snapshot = dict(item)
    return snapshot


def obstacle_phone_guidance_worker(frame, direction, distance_mm, event_type, image_jpeg_b64="", alert_id=None):
    """Background: Gemini labels obstacle; phone already has the photo from instant pass."""
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
            "image_jpeg_b64": result.get("image_jpeg_b64") or image_jpeg_b64 or "",
            "source": result.get("source"),
            "speak": True,
            "replaces_alert_id": alert_id,
        }
        publish_phone_alert(payload)
        queue_event(event_type, {
            "distance_mm": distance_mm,
            "direction": direction,
            "message": text_hi,
            "speak_hi": text_hi,
            "object_label": text_hi,
            "gemini": True,
        })
        print(f"[DESCRIBE] Obstacle Gemini ready ({result.get('source')})")
    except Exception as error:
        print(f"[DESCRIBE] Obstacle guidance failed: {error}")
'''

if old_pub not in text:
    raise SystemExit("publish/worker block not found")
text = text.replace(old_pub, new_pub, 1)

old_snap = '''    with pending_phone_lock:
        snapshot["phone_alert"] = pending_phone_alert.get("payload")
    return snapshot
'''
new_snap = '''    with pending_phone_lock:
        snapshot["phone_alert"] = pending_phone_alert.get("payload")
        snapshot["phone_alerts"] = list(pending_phone_alert.get("queue") or [])
    return snapshot
'''
if old_snap not in text:
    raise SystemExit("status snapshot tail not found")
text = text.replace(old_snap, new_snap, 1)

old_alert = '''                if should_alert:
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

new_alert = '''                if should_alert:
                    announcement = message if message != last_alert_message else None
                    direction = "ahead" if side == "both" else side
                    event_detail = {
                        "distance_mm": distance_mm,
                        "direction": direction,
                        "message": message,
                    }
                    frame_copy = None
                    image_b64 = ""
                    if frame is not None:
                        try:
                            jpeg = frame_to_jpeg_bytes(frame, quality=55)
                            image_b64 = base64.b64encode(jpeg).decode("ascii")
                            event_detail["image_jpeg_b64"] = image_b64
                            frame_copy = frame.copy()
                        except Exception as snap_error:
                            print(f"[CAMERA] Obstacle snapshot skipped: {snap_error}")
                    # Instant pass to phone: photo now (do not wait for Gemini).
                    if distance_mm is None:
                        dist_label = "unknown distance"
                    else:
                        dist_label = (
                            f"{max(1, int(round(distance_mm / 10.0)))} cm"
                            if distance_mm < 1000
                            else (
                                f"{int(round(distance_mm / 1000.0))} m"
                                if abs(distance_mm / 1000.0 - round(distance_mm / 1000.0)) < 0.05
                                else f"{distance_mm / 1000.0:.1f} m"
                            )
                        )
                    dir_word = "Saamne" if direction == "ahead" else direction.capitalize()
                    quick_hi = f"{dir_word} obstacle, about {dist_label}."
                    instant = publish_phone_alert({
                        "kind": "obstacle_snapshot",
                        "event_type": event_type,
                        "direction": direction,
                        "distance_mm": distance_mm,
                        "speak_hi": quick_hi,
                        "text_hi": quick_hi,
                        "image_jpeg_b64": image_b64,
                        "source": "tof_snapshot",
                        "speak": False,
                    })
                    threading.Thread(target=deliver_alert, args=(side, pattern, announcement)).start()
                    queue_event(event_type, event_detail)
                    if frame_copy is not None:
                        threading.Thread(
                            target=obstacle_phone_guidance_worker,
                            args=(frame_copy, direction, distance_mm, event_type, image_b64, instant.get("alert_id")),
                            daemon=True,
                        ).start()
'''

if old_alert not in text:
    raise SystemExit("should_alert block not found")
text = text.replace(old_alert, new_alert, 1)

TARGET.write_text(text)
print("patched", TARGET)
