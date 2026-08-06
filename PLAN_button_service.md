# Divya Drishti — Main Control Button: Implementation Plan for Codex

Repo: `/Users/apple/Documents/divyadrishti`
Pi: `divyadrishti.local` / `pi@fe80::9a91:3fc0:9b08:14%en0` (IPv6 link-local; IPv4 unreliable post-reboot)
Auth: `/tmp/divyadrishti-codex-session-20260802` (do not read/print key material)

## 0. Gate — CONFIRMED (2026-08-06)
- [x] Button physically soldered: GPIO25 (physical pin 22) / GND (physical pin 6). Confirmed via photos.
- [x] Continuity verified electrically: live GPIO25 read-only probe over SSH caught 4 clean press/release cycles (idle=1, press pulls to 0, release back to 1, durations 0.31–0.47s, no bounce/noise). Hardware confirmed good — this replaces/satisfies the manual continuity-test check.
- [x] Close-up photos received and reviewed.
- [x] Pi powered and reachable throughout (fe80::9a91:3fc0:9b08:14%en0).

Gate is open. Proceed to Step 2 (button daemon) onward. Step 1's probe script already exists at /tmp/button_probe.py on the Pi (read-only, uses lgpio, pull-up) — fine to reuse as reference or delete before writing the real daemon.

## Goal
Add a single tactile button on GPIO25 that:
- **Tap (<1.5s):** start/resume `divyadrishti-sensing.service` only. Never toggles any safety feature *off* on a tap.
- **Hold 3–7s then release:** safe shutdown (`systemctl poweroff`).
- **Hold 8s+ then release:** soft reboot (`systemctl reboot`).

Implemented as its own unit, `divyadrishti-control-button.service`, fully separate from `divya_drishti_final.py`. It must never claim ownership of the camera, ToF buses, motors, or speaker — those stay with the sensing service.

## Hard constraints (carried over, do not violate)
- No resistor — internal pull-up only, GPIO25 to GND on press.
- Never wire or drive GPIO25 toward 3.3V/5V.
- Do not use `gpio-poweroff` overlay (breaks normal poweroff + disables GPIO3 wake per Pi firmware docs).
- Do not touch GPIO3 — reserved for future wake-from-halt, phase-1 out of scope.
- Do not stop/restart `divyadrishti-sensing.service`, activate the speaker, or activate motors without telling the user first and getting an explicit go-ahead in the moment.
- Do not deploy `divya_drishti_final.RECONSTRUCTED.py` or `recovered-divya_drishti_final.partial.py.txt` — reference only.
- Never claim a step passed without evidence (command output, log line, or user confirmation).

## Step 1 — Read-only press detection (verification, not a service yet)
Write a throwaway script (e.g. `/home/pi/button_probe.py`) using `gpiozero` or `lgpio` that:
- Configures GPIO25 as input, `pull_up=True`.
- Polls/interrupts on falling and rising edges.
- Prints `PRESSED` / `RELEASED` with timestamps to stdout.

Run it live over SSH (foreground, `Ctrl+C` to stop). Ask the user to physically press the button a few times while it's running. Confirm clean, debounced-looking transitions before proceeding. Delete or leave the probe script — don't wire it into anything.

## Step 2 — Button daemon (`/home/pi/divyadrishti_control_button.py`)
Design:
- Use `gpiozero.Button(25, pull_up=True, bounce_time=0.05)` (or lgpio equivalent) for hardware debounce.
- On press: record `press_time`.
- On release: compute `held = release_time - press_time`.
  - `held < 1.5s` → tap action.
  - `3s <= held <= 7s` → shutdown action.
  - `8s <= held` → reboot action.
  - Anything in the dead zones (1.5–3s, 7–8s) → no-op, log it (avoids accidental trigger near a threshold).
- Tap action: run `systemctl start divyadrishti-sensing.service` (idempotent — if already active, this is a no-op restart-free start; do NOT `restart`, since that would interrupt an already-running session pointlessly). Log the action.
- Shutdown action: log intent, brief pause (e.g. 1s) is optional but not required since release already happened; call `systemctl poweroff`.
- Reboot action: log intent, call `systemctl reboot`.
- All `systemctl` calls need appropriate privilege — daemon should run as root via systemd (see unit below), calling `systemctl` directly rather than shelling out with sudo.
- Log to a dedicated file (e.g. `/var/log/divyadrishti-control-button.log`) or journal — enough to reconstruct tap/hold decisions after the fact for debugging.
- No busy-wait polling loop if `gpiozero` event callbacks are available — prefer interrupt-driven to keep CPU/power usage low on a Zero 2W.

## Step 3 — systemd unit (`divyadrishti-control-button.service`)
- `Type=simple`, `ExecStart=/usr/bin/python3 /home/pi/divyadrishti_control_button.py`
- `Restart=on-failure` (daemon should survive a crash and keep watching the button; don't let a bug in this service brick physical shutdown access)
- `After=multi-user.target` — should not hard-depend on `divyadrishti-sensing.service` (button daemon must work even if sensing is down, since tap is meant to *start* it)
- Runs as root (needed for `systemctl poweroff`/`reboot`) — no sudo wrapper needed if the unit itself runs as root
- `WantedBy=multi-user.target`, enable so it survives reboot

Place the unit at `setup/hardware-integration/divyadrishti-control-button.service` in the repo (matching existing convention for the BLE/hotspot units), then deploy to `/etc/systemd/system/` on the Pi.

## Step 4 — Deploy sequence
1. Copy `divyadrishti_control_button.py` to `/home/pi/`.
2. Copy the `.service` file to `/etc/systemd/system/`.
3. `systemctl daemon-reload`
4. `systemctl enable divyadrishti-control-button.service`
5. `systemctl start divyadrishti-control-button.service`
6. `systemctl status divyadrishti-control-button.service` — confirm active, no crash loop.

## Step 5 — Testing (staged, with explicit user sign-off between stages)
1. **Tap only, first.** Stop sensing manually (`systemctl stop divyadrishti-sensing.service`) with the user's explicit go-ahead, then tap the button and confirm sensing comes back `active` via `systemctl is-active`. Do this over the still-connected SSH session so nothing is lost if something goes wrong.
2. **Tell the user before testing hold-to-shutdown or hold-to-reboot** — both will drop the current SSH session. Get explicit confirmation of timing/readiness before triggering.
3. Shutdown test: hold 3–7s, release, confirm Pi actually powers off (SSH session dies, no ping response). User manually power-cycles per known phase-1 limitation (GPIO25-only wiring can't wake it).
4. Reboot test: after next power-up, hold 8s+ release, confirm Pi reboots (SSH drops, then comes back after boot) and the button service auto-starts again (`systemctl is-enabled` / `is-active` after reboot).
5. Confirm dead-zone behavior once (e.g. hold ~2s) — should do nothing.

## Step 6 — Rollback if something's wrong
- `systemctl disable --now divyadrishti-control-button.service` to fully back out without touching sensing/BLE/hotspot services.
- Keep the probe script's known-good GPIO25 read as the reference if the daemon misbehaves — re-run it to isolate hardware vs. software issues.

## Not in scope for this pass
- GPIO3 wake-from-halt.
- Hidden/recessed emergency `RUN` reset button.
- Any real power-cutting/latching circuit — `systemctl poweroff` is a safe halt, not physical power removal.
