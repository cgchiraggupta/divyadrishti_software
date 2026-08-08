#!/usr/bin/env python3
"""Add nearby /v1/settings so app Apply updates glasses immediately (dual with cloud)."""

from __future__ import annotations

from pathlib import Path

MAIN = Path("/home/pi/divya_drishti_final.py")

STATUS_OLD = '''def local_status_snapshot():
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
        }'''

STATUS_NEW = '''def apply_settings_from_companion(payload):
    """Apply settings from the nearby companion immediately, then ack cloud if possible."""
    settings = validate_runtime_settings(payload)
    request_id = str(payload.get("request_id") or "").strip() or None
    snapshot = settings_state_snapshot()
    store_settings_state(settings, request_id or snapshot["last_applied_request_id"], None)
    print(
        f"[SETTINGS] Nearby companion applied sensitivity_mm="
        f"{settings['sensitivity_mm']} feedback={settings['feedback_mode']}"
    )

    # Best-effort: claim+ack the matching cloud request so app confirmation matches hardware.
    if not sync_enabled():
        return settings_state_snapshot()["settings"]

    with state_lock:
        device_id = state["device_id"]
    if not device_id:
        return settings_state_snapshot()["settings"]

    try:
        request = call_settings_rpc(
            "claim_next_device_setting_request",
            {"device_id_input": device_id},
        )
        if request and request.get("state") == "applying":
            ack = prepare_settings_ack(request)
            if ack:
                retry_pending_settings_ack()
    except Exception as error:
        print(f"[SETTINGS] Nearby cloud ack skipped: {error}")
    return settings_state_snapshot()["settings"]


def local_status_snapshot():
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
            "settings": runtime_settings_snapshot(),
        }'''

GET_OLD = '''    def do_GET(self):
        if self.path == "/v1/health":
            self.send_json(200, {"name": "Divya Drishti", "available": True})
            return
        if self.path != "/v1/status":
            self.send_json(404, {"error": "Not found"})
            return
        if not local_pairing_code_matches(self.headers):
            self.send_json(401, {"error": "Pairing required"})
            return
        self.send_json(200, local_status_snapshot())'''

GET_NEW = '''    def do_GET(self):
        if self.path == "/v1/health":
            self.send_json(200, {"name": "Divya Drishti", "available": True})
            return
        if self.path == "/v1/settings":
            if not local_pairing_code_matches(self.headers):
                self.send_json(401, {"error": "Pairing required"})
                return
            snap = settings_state_snapshot()
            self.send_json(200, {
                "status": "ok",
                "settings": snap["settings"],
                "last_applied_request_id": snap["last_applied_request_id"],
            })
            return
        if self.path != "/v1/status":
            self.send_json(404, {"error": "Not found"})
            return
        if not local_pairing_code_matches(self.headers):
            self.send_json(401, {"error": "Pairing required"})
            return
        self.send_json(200, local_status_snapshot())'''

POST_OLD = '''    def do_POST(self):
        if self.path != "/v1/command":
            self.send_json(404, {"error": "Not found"})
            return
        if not local_pairing_code_matches(self.headers):
            self.send_json(401, {"error": "Pairing required"})
            return
        try:
            size = min(int(self.headers.get("Content-Length", "0")), 2048)
            payload = json.loads(self.rfile.read(size) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid request"})
            return
        command = str(payload.get("command", "")).lower()
        if command not in ("pause", "resume", "describe", "read", "unmute_haptics"):
            self.send_json(400, {"error": "Unsupported command"})
            return'''

POST_NEW = '''    def do_POST(self):
        if self.path not in ("/v1/command", "/v1/settings"):
            self.send_json(404, {"error": "Not found"})
            return
        if not local_pairing_code_matches(self.headers):
            self.send_json(401, {"error": "Pairing required"})
            return
        try:
            size = min(int(self.headers.get("Content-Length", "0")), 2048)
            payload = json.loads(self.rfile.read(size) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid request"})
            return

        if self.path == "/v1/settings":
            try:
                settings = apply_settings_from_companion(payload)
            except ValueError as error:
                self.send_json(400, {"status": "error", "error": str(error)})
                return
            except Exception as error:
                print(f"[SETTINGS] Nearby apply failed: {error}")
                self.send_json(500, {"status": "error", "error": "Could not apply settings"})
                return
            self.send_json(200, {
                "status": "ok",
                "settings": settings,
                "updated_at": utc_now(),
            })
            return

        command = str(payload.get("command", "")).lower()
        if command not in ("pause", "resume", "describe", "read", "unmute_haptics"):
            self.send_json(400, {"error": "Unsupported command"})
            return'''


def main() -> None:
    text = MAIN.read_text(encoding="utf-8")
    changed = False

    if "def apply_settings_from_companion" not in text:
        if STATUS_OLD not in text:
            raise SystemExit("local_status_snapshot block not found")
        text = text.replace(STATUS_OLD, STATUS_NEW, 1)
        changed = True
        print("added apply_settings_from_companion + status.settings")
    else:
        print("apply_settings_from_companion already present")

    if '/v1/settings"' not in text.split("def do_GET")[1].split("def do_POST")[0]:
        if GET_OLD not in text:
            raise SystemExit("do_GET block not found")
        text = text.replace(GET_OLD, GET_NEW, 1)
        changed = True
        print("patched do_GET /v1/settings")
    else:
        print("do_GET /v1/settings already present")

    if 'self.path == "/v1/settings"' not in text.split("def do_POST")[1][:1200]:
        if POST_OLD not in text:
            raise SystemExit("do_POST block not found")
        text = text.replace(POST_OLD, POST_NEW, 1)
        changed = True
        print("patched do_POST /v1/settings")
    else:
        print("do_POST /v1/settings already present")

    if '"settings": runtime_settings_snapshot()' not in text and "settings\": runtime_settings_snapshot()" not in text:
        # STATUS_NEW already adds it when replace works; double-check
        if '"settings": runtime_settings_snapshot()' not in text:
            print("warning: status.settings may be missing")

    if changed:
        backup = MAIN.with_suffix(MAIN.suffix + ".bak-before-nearby-settings")
        if not backup.exists():
            backup.write_text(MAIN.read_text(encoding="utf-8"), encoding="utf-8")
        MAIN.write_text(text, encoding="utf-8")
        print("patched main script")
    else:
        print("no main-script changes needed")


if __name__ == "__main__":
    main()
