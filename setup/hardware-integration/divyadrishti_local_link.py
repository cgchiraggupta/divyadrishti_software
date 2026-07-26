#!/usr/bin/env python3
"""Safe same-Wi-Fi availability service for Divya Drishti setup and testing.

This process deliberately imports no GPIO, camera, microphone, or audio library.
It is useful before the full glasses program is started. Stop it before starting
divya_drishti_final.py, which provides the richer version of the same endpoint.
"""

import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8765
DEVICE_FILE = Path.home() / ".divyadrishti" / "device.json"


def pairing_code():
    try:
        return json.loads(DEVICE_FILE.read_text()).get("pairing_code", "").upper()
    except (FileNotFoundError, json.JSONDecodeError):
        return ""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[LOCAL] {self.address_string()} - {fmt % args}")

    def respond(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "https://localhost")
        self.send_header("Access-Control-Allow-Headers", "X-Divya-Pairing-Code")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.respond(204, {})

    def do_GET(self):
        if self.path == "/v1/health":
            self.respond(200, {"name": "Divya Drishti", "available": True, "mode": "setup"})
            return
        if self.path != "/v1/status":
            self.respond(404, {"error": "Not found"})
            return
        supplied = self.headers.get("X-Divya-Pairing-Code", "").strip().upper()
        expected = pairing_code()
        if not expected or not supplied or not hmac.compare_digest(expected, supplied):
            self.respond(401, {"error": "Pairing required"})
            return
        self.respond(200, {
            "available": True,
            "paused": False,
            "last_scene": "Glasses are nearby and ready for setup.",
            "tof_left_ok": False,
            "tof_right_ok": False,
            "camera_ok": False,
            "mic_ok": False,
            "mode": "setup",
        })


class Server(ThreadingHTTPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    print(f"[LOCAL] Setup link listening on port {PORT}")
    Server(("0.0.0.0", PORT), Handler).serve_forever()
