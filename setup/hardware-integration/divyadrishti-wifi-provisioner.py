#!/usr/bin/env python3
"""Local, one-time Wi-Fi provisioning endpoint for Divya Drishti setup mode."""

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PAIRING_CODE = os.environ.get("DIVYADRISHTI_PAIRING_CODE", "RA46W4").upper()
HOSTAPD_CONFIG = "/etc/hostapd/hostapd.conf"


def run(*command: str) -> None:
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def connect_to_wifi(ssid: str, password: str) -> None:
    """Persist the profile before leaving hotspot mode, then connect to it."""
    try:
        profile = f"DivyaDrishti-{ssid}"[:64]
        try:
            run("nmcli", "connection", "delete", profile)
        except subprocess.CalledProcessError:
            pass
        run(
            "nmcli", "connection", "add", "type", "wifi", "ifname", "wlan0",
            "con-name", profile, "ssid", ssid,
            "wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password,
            "connection.autoconnect", "yes",
        )
        # The profile is safely stored by NetworkManager before the hotspot is stopped.
        subprocess.run(("pkill", "-TERM", "-f", f"/usr/sbin/hostapd {HOSTAPD_CONFIG}"), check=False)
        subprocess.run(("systemctl", "stop", "dnsmasq"), check=False)
        subprocess.run(("ip", "addr", "flush", "dev", "wlan0"), check=False)
        run("nmcli", "device", "set", "wlan0", "managed", "yes")
        run("nmcli", "connection", "up", profile)
    finally:
        # This service is a child of the setup fallback. Exit after an attempt
        # so the fallback can automatically return if the network is unusable.
        os._exit(0)


class ProvisioningHandler(BaseHTTPRequestHandler):
    server_version = "DivyaDrishtiSetup/1.0"

    def log_message(self, format: str, *args: object) -> None:
        return

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path != "/v1/wifi":
            self.send_json(404, {"error": "Not found"})
            return
        if self.headers.get("X-Divya-Pairing-Code", "").upper() != PAIRING_CODE:
            self.send_json(403, {"error": "Pairing code is invalid"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length))
            ssid = str(data["ssid"]).strip()
            password = str(data["password"])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "Wi-Fi name and password are required"})
            return
        if not 1 <= len(ssid.encode()) <= 32 or any(ord(character) < 32 for character in ssid):
            self.send_json(400, {"error": "Wi-Fi name is invalid"})
            return
        if not 8 <= len(password) <= 63:
            self.send_json(400, {"error": "Wi-Fi password must be 8 to 63 characters"})
            return

        self.send_json(202, {"status": "connecting"})
        threading.Thread(target=connect_to_wifi, args=(ssid, password), daemon=True).start()


if __name__ == "__main__":
    ThreadingHTTPServer(("192.168.4.1", 8080), ProvisioningHandler).serve_forever()
