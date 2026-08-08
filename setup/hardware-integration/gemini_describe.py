#!/usr/bin/env python3
"""Shared Gemini read/obstacle helper for Divya Drishti.

Phone-first: returns Hinglish text (and optional in-memory JPEG bytes).
Does not write captured images to disk. API key loaded from env or
~/.divyadrishti/gemini.env — never log the key value.
"""

from __future__ import annotations

import base64
import json
import os
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import cv2

GEMINI_ENV_FILE = Path.home() / ".divyadrishti" / "gemini.env"
# gemini-2.5-flash returns 404 for new keys; flash-latest is currently available.
GEMINI_MODEL = "gemini-flash-latest"
GEMINI_TIMEOUT_SECONDS = 12
DESCRIBE_COOLDOWN_SECONDS = 8
OBSTACLE_COOLDOWN_SECONDS = 6
MOCK_READ_HI = (
    "Mock read: wall par EXIT likha hai, neeche small label pe 'Gate 2' dikh raha hai."
)
MOCK_OBSTACLE_HI = "Mock: saamne chair hai, lagbhag 0.8 m."

# On-demand button: READ text / signs in front (not full room tour).
READ_PROMPT = (
    "You are Divya Drishti Read mode for a blind or low-vision user. "
    "Priority: read clearly visible text, signs, labels, boards, screens, or numbers "
    "in this photo. Use natural Indian Hinglish (Hindi+English mix, not pure Hindi script only). "
    "If no useful text is visible, say briefly what is directly in front that helps reading "
    "context (e.g. 'board saamne hai but text clear nahi'). "
    "Do NOT describe the whole room or far background. Max 40 words."
)

# Auto obstacle alert: only the near obstacle that triggered ToF.
OBSTACLE_PROMPT = (
    "You are Divya Drishti obstacle mode. A distance sensor fired: direction={direction}, "
    "measured distance about {distance}. User obstacle range setting is max {max_range}. "
    "Look at the photo and name ONLY the nearby obstacle likely causing that reading "
    "(roughly within {max_range}, toward {direction}). "
    "Reply in short Indian Hinglish. Example: 'Saamne chair hai, lagbhag 80 cm.' "
    "Do NOT mention far walls, distant people, sky, or anything clearly beyond {max_range}. "
    "If the near obstacle is unclear, say so briefly with the distance. Max 20 words."
)

_cooldown_lock = threading.Lock()
_last_describe_at = 0.0
_last_obstacle_at = 0.0


def load_api_key() -> str:
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key
    try:
        for line in GEMINI_ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.partition("=")[2].strip()
    except OSError:
        pass
    return ""


def cooldown_remaining() -> float:
    with _cooldown_lock:
        elapsed = time.monotonic() - _last_describe_at
    remaining = DESCRIBE_COOLDOWN_SECONDS - elapsed
    return remaining if remaining > 0 else 0.0


def obstacle_cooldown_remaining() -> float:
    with _cooldown_lock:
        elapsed = time.monotonic() - _last_obstacle_at
    remaining = OBSTACLE_COOLDOWN_SECONDS - elapsed
    return remaining if remaining > 0 else 0.0


def _mark_describe_used() -> None:
    global _last_describe_at
    with _cooldown_lock:
        _last_describe_at = time.monotonic()


def _mark_obstacle_used() -> None:
    global _last_obstacle_at
    with _cooldown_lock:
        _last_obstacle_at = time.monotonic()


def format_distance_label(distance_mm: int | None) -> str:
    """Human distance from sensor millimetres. Under 1 m → cm (e.g. 320 → '32 cm')."""
    if distance_mm is None:
        return "unknown distance"
    mm = max(0, int(distance_mm))
    if mm < 1000:
        return f"{max(1, int(round(mm / 10.0)))} cm"
    meters = mm / 1000.0
    if abs(meters - round(meters)) < 0.05:
        return f"{int(round(meters))} m"
    return f"{meters:.1f} m"


# Back-compat alias used by older call sites / patches.
def _format_m(distance_mm: int | None) -> str:
    return format_distance_label(distance_mm)


def frame_to_jpeg_bytes(frame, quality: int = 70) -> bytes:
    # Picamera2 still frames are RGB; encode as BGR for natural JPEG colors.
    if getattr(frame, "ndim", 0) == 3 and frame.shape[2] == 3:
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("Could not encode the camera frame in memory.")
    return encoded.tobytes()


def describe_frame(frame, *, include_image: bool = True, prompt: str | None = None) -> dict:
    """On-demand READ: OCR / what's in front. Returns JSON-serializable dict."""
    remaining = cooldown_remaining()
    if remaining > 0:
        return {
            "status": "cooldown",
            "text_hi": "",
            "source": "cooldown",
            "retry_after_seconds": int(remaining + 0.999),
        }

    _mark_describe_used()
    key = load_api_key()
    jpeg = frame_to_jpeg_bytes(frame)

    try:
        if not key or key == "mock":
            text_hi = MOCK_READ_HI
            source = "mock"
        else:
            text_hi = _call_gemini(jpeg, key, prompt or READ_PROMPT)
            source = "gemini"
        result = {
            "status": "ok",
            "text_hi": text_hi,
            "source": source,
            "mode": "read",
        }
    except RuntimeError as error:
        result = {
            "status": "error",
            "text_hi": "Abhi read nahi ho paya. Thodi der baad phir try karein.",
            "source": "fallback",
            "error": str(error),
            "mode": "read",
        }

    if include_image:
        result["image_jpeg_b64"] = base64.b64encode(jpeg).decode("ascii")
    return result


def describe_obstacle(
    frame,
    *,
    direction: str,
    distance_mm: int | None,
    max_range_mm: int | None = 2500,
) -> dict:
    """Event-triggered near-obstacle label for phone TTS."""
    remaining = obstacle_cooldown_remaining()
    if remaining > 0:
        return {
            "status": "cooldown",
            "text_hi": "",
            "source": "cooldown",
            "retry_after_seconds": int(remaining + 0.999),
        }

    # Respect product range: do not invent far-scene narration outside settings.
    range_mm = int(max_range_mm or 2500)
    range_mm = max(1000, min(2500, range_mm))
    if distance_mm is not None and distance_mm > range_mm + 300:
        distance = _format_m(distance_mm)
        return {
            "status": "skipped",
            "text_hi": f"{direction or 'Saamne'} obstacle sensor reading {distance}, settings range ke bahar.",
            "source": "range_skip",
            "direction": direction,
            "distance_mm": distance_mm,
        }

    _mark_obstacle_used()
    distance = _format_m(distance_mm)
    max_range = _format_m(range_mm)
    prompt = OBSTACLE_PROMPT.format(
        direction=direction or "ahead",
        distance=distance,
        max_range=max_range,
    )
    key = load_api_key()
    jpeg = frame_to_jpeg_bytes(frame, quality=55)
    try:
        if not key or key == "mock":
            text_hi = f"Mock: {direction or 'saamne'} obstacle hai, about {distance}."
            source = "mock"
        else:
            text_hi = _call_gemini(jpeg, key, prompt)
            source = "gemini"
        return {
            "status": "ok",
            "text_hi": text_hi,
            "source": source,
            "image_jpeg_b64": base64.b64encode(jpeg).decode("ascii"),
            "direction": direction,
            "distance_mm": distance_mm,
        }
    except RuntimeError as error:
        return {
            "status": "error",
            "text_hi": f"{direction or 'Saamne'} obstacle hai, about {distance}.",
            "source": "fallback",
            "error": str(error),
            "image_jpeg_b64": base64.b64encode(jpeg).decode("ascii"),
            "direction": direction,
            "distance_mm": distance_mm,
        }


def _call_gemini(jpeg_bytes: bytes, api_key: str, prompt: str) -> str:
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64.b64encode(jpeg_bytes).decode("ascii"),
                    }
                },
            ]
        }],
    }
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=GEMINI_TIMEOUT_SECONDS) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            detail = error.read().decode("utf-8", errors="ignore")[:160]
        except Exception:
            pass
        raise RuntimeError(f"Gemini HTTP {error.code}{(': ' + detail) if detail else ''}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("Gemini request timed out or could not reach the service.") from error

    parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    text = " ".join(part.get("text", "").strip() for part in parts if part.get("text")).strip()
    if not text:
        raise RuntimeError("Gemini returned no description text.")
    return text
