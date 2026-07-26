#!/usr/bin/env bash
set -euo pipefail

INTERFACE=wlan0
HOTSPOT_IP=192.168.4.1/24
WAIT_SECONDS=45

connected() {
  ip route | grep -q "^default.*$INTERFACE"
}

while true; do
  # Stay dormant while any saved Wi-Fi is usable. If it drops later (for
  # example in a new building), the same fallback path activates.
  while connected; do
    sleep 10
  done

  for _ in $(seq 1 "$WAIT_SECONDS"); do
    connected && break
    sleep 1
  done
  connected && continue

  logger -t divyadrishti-hotspot "No saved Wi-Fi available; entering setup hotspot mode"
  ip addr flush dev "$INTERFACE"
  ip addr add "$HOTSPOT_IP" dev "$INTERFACE"
  systemctl restart dnsmasq
  # This endpoint accepts credentials only from a phone already on the private
  # setup hotspot. It is terminated automatically once hostapd exits.
  /usr/local/sbin/divyadrishti-wifi-provisioner &
  exec /usr/sbin/hostapd /etc/hostapd/hostapd.conf
done
