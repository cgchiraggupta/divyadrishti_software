# Divya Drishti — Describe / Read (phone-first) Plan

Repo: `/Users/apple/Documents/divyadrishti`
Pi: `pi@divyadrishti.local` (or IPv6 link-local)
Main sensing script: `/home/pi/divya_drishti_final.py` (edit only with explicit diff approval)

## Product direction (updated)

**Near-term UX (current build):** DeepGear TST on the phone is the primary output surface while the glasses speaker hardware is weak.

1. **On-demand describe/read** — user taps a button in the app → Pi camera captures one frame in memory → Gemini vision returns a **Hinglish** description (scene + any useful visible text) → phone shows the text and speaks it with **Sarvam** (`hi-IN`).
2. **Obstacle companion (Phase 2)** — when ToF alerts, optionally attach a rate-limited snapshot so the phone can show what is ahead (plus existing Hindi alert copy / Sarvam).
3. **Later** — “Hey Divya Drishti” voice assistant; optional glasses speaker again after hardware swap.

Glasses espeak is **not** required for Phase 1 success criteria.

## Defaults in force (change if Chandar asks)

- Hinglish: Gemini prompted to answer in natural Indian Hinglish (Hindi + English mix).
- Trigger: phone button only (GPIO25 unchanged).
- Images: in-memory on Pi; may travel to the phone over local HTTP for display; no permanent photo library on Pi.
- Obstacle photos: Phase 2, rate-limited (not every frame).
- History gallery: no permanent image archive yet.
- Cooldown: 8 seconds server-side on Pi between describe calls.

## Architecture

```
Phone (DeepGear TST)
  → POST /v1/command { command: "describe" }  (pairing header)
  ← { status, text_hi, retry_after_seconds?, image_jpeg_b64? }
  → show text_hi + speakWithSarvam / speakGuidance

Pi sensing service
  ToF + vibration loop unchanged
  Shared Picamera2 + camera_lock for safe one-shot capture
  gemini_describe helper (key from ~/.divyadrishti/gemini.env)
```

## Build phases

### Phase 1 — Phone describe/read (NOW)
- [x] Isolated probe `/home/pi/gemini_describe_probe.py` (mock + real API path)
- [ ] Shared helper `/home/pi/gemini_describe.py` (Hinglish prompt, 8s cooldown, no disk image)
- [ ] Wire `describe` into `/v1/command` (return Hinglish text; optional small JPEG for UI)
- [ ] App: Describe button, show text, Sarvam speak; longer HTTP timeout for this command only
- [ ] Prove one real Gemini response as **text** (temp log OK; glasses speak optional)

### Phase 2 — Obstacle snapshot on phone
- Rate-limited frame on obstacle alert
- Event / local status carries thumbnail + existing distance guidance
- Never block haptic loop on Gemini latency (labeling can be async)

### Phase 3 — Richer obstacle labels
- Optional Gemini object label when a frame is available

### Phase 4 — Voice assistant
- Wake phrase / mic intents calling the same describe pipeline

### Phase 5 — Glasses speaker revisit
- After speaker hardware change; phone remains companion for text + image

## Hard constraints (unchanged)
- No sensing stop/restart without moment-of go-ahead.
- No main-script edit without showing exact diff + approval.
- Never echo Gemini API key, Wi-Fi passwords, or pairing secrets.
- No `git add .` / `git add -A`; preserve unrelated working-tree changes.
- Evidence before “it works” claims.

## Explicitly out of scope for Phase 1
- Wake-word / Siri-like always-listen
- Glasses-speaker quality tuning (deferred to hardware swap)
- Continuous background description
- Changing ToF / vibration behavior
- Permanent on-device photo archive
