#!/usr/bin/env python3
"""Fix 10x distance labels (320 mm was spoken as '3.2 m') and gate ToF on sensitivity."""

from __future__ import annotations

from pathlib import Path

MAIN = Path("/home/pi/divya_drishti_final.py")

OLD_BAD_LABEL = (
    'dist_label = f"{max(1, int(round(distance_mm / 10.0)) / 10.0)} m"'
)
NEW_LABEL = (
    "dist_label = (\n"
    "                            f\"{max(1, int(round(distance_mm / 10.0)))} cm\"\n"
    "                            if distance_mm < 1000\n"
    "                            else (\n"
    "                                f\"{int(round(distance_mm / 1000.0))} m\"\n"
    "                                if abs(distance_mm / 1000.0 - round(distance_mm / 1000.0)) < 0.05\n"
    "                                else f\"{distance_mm / 1000.0:.1f} m\"\n"
    "                            )\n"
    "                        )"
)

OLD_DECIDE = '''def decide_alert(tof_left, tof_right, cv_densities):
    """Prefer ToF (accurate, real distance) over CV (heuristic) when available."""
    caution_distance = runtime_settings_snapshot()["sensitivity_mm"]

    # ── ToF path ──
    if tof_left is not None or tof_right is not None:
        vals = [d for d in [tof_left, tof_right] if d is not None]
        closest = min(vals) if vals else None

        if tof_left and tof_right:
            dist_cm = closest // 10
            if closest < TOF_URGENT_MM:
                return ("both", "rapid", f"obstacle directly ahead, {dist_cm} centimeters")
            elif closest < TOF_WARNING_MM:
                return ("both", "double", f"obstacle ahead, {dist_cm} centimeters")
            elif closest < caution_distance:
                return ("both", "single", "object nearby ahead")
        elif tof_left and tof_left < caution_distance:
            dist_cm = tof_left // 10
            if tof_left < TOF_URGENT_MM:
                return ("left", "rapid", f"obstacle very close on left, {dist_cm} centimeters")
            elif tof_left < TOF_WARNING_MM:
                return ("left", "double", f"obstacle on left, {dist_cm} centimeters")
            return ("left", "single", "object nearby on left")
        elif tof_right and tof_right < caution_distance:
            dist_cm = tof_right // 10
            if tof_right < TOF_URGENT_MM:
                return ("right", "rapid", f"obstacle very close on right, {dist_cm} centimeters")
            elif tof_right < TOF_WARNING_MM:
                return ("right", "double", f"obstacle on right, {dist_cm} centimeters")
            return ("right", "single", "object nearby on right")

        return (None, None, "path clear")'''

NEW_DECIDE = '''def decide_alert(tof_left, tof_right, cv_densities):
    """Prefer ToF (accurate, real distance) over CV (heuristic) when available."""
    caution_distance = runtime_settings_snapshot()["sensitivity_mm"]

    # ── ToF path ──
    if tof_left is not None or tof_right is not None:
        vals = [d for d in [tof_left, tof_right] if d is not None]
        closest = min(vals) if vals else None

        # Always respect Settings range first — never alert beyond sensitivity_mm.
        if closest is None or closest >= caution_distance:
            return (None, None, "path clear")

        if tof_left and tof_right:
            dist_cm = max(1, int(round(closest / 10.0)))
            if closest < TOF_URGENT_MM:
                return ("both", "rapid", f"obstacle directly ahead, {dist_cm} centimeters")
            if closest < TOF_WARNING_MM:
                return ("both", "double", f"obstacle ahead, {dist_cm} centimeters")
            return ("both", "single", "object nearby ahead")
        if tof_left and tof_left < caution_distance:
            dist_cm = max(1, int(round(tof_left / 10.0)))
            if tof_left < TOF_URGENT_MM:
                return ("left", "rapid", f"obstacle very close on left, {dist_cm} centimeters")
            if tof_left < TOF_WARNING_MM:
                return ("left", "double", f"obstacle on left, {dist_cm} centimeters")
            return ("left", "single", "object nearby on left")
        if tof_right and tof_right < caution_distance:
            dist_cm = max(1, int(round(tof_right / 10.0)))
            if tof_right < TOF_URGENT_MM:
                return ("right", "rapid", f"obstacle very close on right, {dist_cm} centimeters")
            if tof_right < TOF_WARNING_MM:
                return ("right", "double", f"obstacle on right, {dist_cm} centimeters")
            return ("right", "single", "object nearby on right")

        return (None, None, "path clear")'''


def main() -> None:
    text = MAIN.read_text(encoding="utf-8")
    changed = False

    if OLD_DECIDE in text:
        text = text.replace(OLD_DECIDE, NEW_DECIDE, 1)
        changed = True
        print("patched decide_alert sensitivity gate")
    elif "Always respect Settings range first" in text:
        print("decide_alert already gated")
    else:
        raise SystemExit("decide_alert block not found — refuse to patch blindly")

    count = text.count(OLD_BAD_LABEL)
    if count:
        text = text.replace(OLD_BAD_LABEL, NEW_LABEL)
        changed = True
        print(f"patched {count} dist_label site(s)")
    elif "distance_mm < 1000" in text and "cm" in text:
        print("dist_label already uses cm/m")
    else:
        raise SystemExit("bad dist_label pattern not found")

    if changed:
        backup = MAIN.with_suffix(MAIN.suffix + ".bak-before-distance-label")
        if not backup.exists():
            backup.write_text(MAIN.read_text(encoding="utf-8"), encoding="utf-8")
        MAIN.write_text(text, encoding="utf-8")
        print("patched main script")
    else:
        print("no main-script changes needed")


if __name__ == "__main__":
    main()
