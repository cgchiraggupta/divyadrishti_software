#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime

p = Path("/home/pi/divya_drishti_final.py")
text = p.read_text()
Path(f"/home/pi/divya_drishti_final.py.bak-before-live-snap-{datetime.now():%Y%m%d-%H%M%S}").write_text(text)

old = '''    with pending_phone_lock:
        snapshot["phone_alert"] = pending_phone_alert.get("payload")
        snapshot["phone_alerts"] = list(pending_phone_alert.get("queue") or [])
    return snapshot
'''
new = '''    with pending_phone_lock:
        queue = list(pending_phone_alert.get("queue") or [])
        # Only ship the newest few to the phone (full images). Older entries text-only.
        slim = []
        newest = list(reversed(queue[-3:]))
        for index, item in enumerate(newest):
            copy = dict(item)
            if index >= 2:
                copy["image_jpeg_b64"] = ""
            slim.append(copy)
        slim.reverse()
        snapshot["phone_alert"] = pending_phone_alert.get("payload")
        snapshot["phone_alerts"] = slim
    return snapshot
'''
if old not in text:
    raise SystemExit("status block missing")
text = text.replace(old, new, 1)

old_rem = '''                elif haptic_reminder:
                    # No message = vibration only; no repeated speech/events.
                    threading.Thread(target=deliver_alert, args=(side, pattern, None)).start()
                    last_alert = now
'''
new_rem = '''                elif haptic_reminder:
                    # No message = vibration only; no repeated speech/events.
                    threading.Thread(target=deliver_alert, args=(side, pattern, None)).start()
                    # While obstacle stays, refresh phone photo every reminder tick
                    # so continuous buzz still shows an updated live capture.
                    if frame is not None:
                        try:
                            jpeg = frame_to_jpeg_bytes(frame, quality=50)
                            image_b64 = base64.b64encode(jpeg).decode("ascii")
                            direction = "ahead" if side == "both" else side
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
                            dir_word = "Saamne" if direction == "ahead" else str(direction).capitalize()
                            publish_phone_alert({
                                "kind": "obstacle_snapshot",
                                "event_type": event_type,
                                "direction": direction,
                                "distance_mm": distance_mm,
                                "speak_hi": f"{dir_word} obstacle, about {dist_label}.",
                                "text_hi": f"{dir_word} obstacle, about {dist_label}.",
                                "image_jpeg_b64": image_b64,
                                "source": "tof_live",
                                "speak": False,
                            })
                        except Exception as snap_error:
                            print(f"[CAMERA] Live snapshot skipped: {snap_error}")
                    last_alert = now
'''
if old_rem not in text:
    raise SystemExit("haptic_reminder block missing")
text = text.replace(old_rem, new_rem, 1)
p.write_text(text)
print("patched")
