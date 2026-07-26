# Raspberry Pi Zero W: first-time Wi-Fi setup

This is for a **Raspberry Pi Zero W** (not Zero 2W). Its single `wlan0` radio
switches between setup hotspot mode and normal Wi-Fi client mode.

## Customer flow

1. On boot, the Pi tries its saved Wi-Fi networks for 45 seconds.
2. If none connect, it starts `DivyaDrishti-Setup` at `192.168.4.1`.
3. The user joins that hotspot from phone Wi-Fi settings, opens the app, and
   chooses **Using a new Wi-Fi?**.
4. The app posts the chosen SSID/password to `http://192.168.4.1:8080/v1/wifi`.
5. The Pi saves the credentials, turns off the hotspot, and joins the new Wi-Fi.

## Pi service requirements

- `hostapd` and `dnsmasq` for the temporary hotspot.
- A root-owned provisioning HTTP service bound only while setup mode is active.
- The service must validate `X-Divya-Pairing-Code` against the fixed prototype
  code before accepting credentials.
- Store Wi-Fi secrets only in the OS Wi-Fi manager configuration with `0600`
  permissions; never in the React repo or Supabase.

Do not enable this while connected remotely over `wlan0`: enabling the hotspot
intentionally disconnects the current Wi-Fi session.
