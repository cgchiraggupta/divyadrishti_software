# Divya Drishti — Resume Plan (as of Aug 8, 2026)

## Where things actually stand

Static code review says feature-complete. Live runtime check (via Cursor) says two things are blocked. Trust the live check — it caught what static review couldn't:

- **Gemini API is returning HTTP 429** (quota exceeded) — blocks Read and obstacle-naming
- **Phone is unplugged**, latest APK not installed — blocks final Android verification

Everything else (ToF, vibration, pause/resume, settings sync, photo→History, portable walk-test) is confirmed working live, not just present in code.

---

## Step 1 — Unblock Gemini (do this first, before anything else)

- [ ] Check Google AI Studio / Cloud Console billing on the Gemini API key — likely free-tier quota hit, not a code bug
- [ ] If free tier: either wait for reset window or attach billing to raise the quota
- [ ] Confirm fix by re-running `gemini_describe_probe.py` on the Pi (isolated call, log to temp file — don't rely on SSH echo, it truncated last time)
- [ ] Only after that succeeds, retest the real Describe button end-to-end from the phone

## Step 2 — Get the phone back in the loop

- [ ] Plug phone in, confirm ADB sees it (`adb devices` → `0015935A7000905`)
- [ ] Build + install latest APK (`npm run android:build` → install)
- [ ] Re-check History tab refresh and Settings "on glasses now" sync — these were the two things riding on this APK

## Step 3 — The actual exit test

Once Step 1 and Step 2 are clear:

- [ ] 5-minute wearable walk test: Pi + glasses on body, phone nearby on same Wi-Fi
- [ ] Confirm during the walk: obstacle vibration fires correctly, phone shows live status, at least one Describe/Read call succeeds, at least one obstacle photo lands in History
- [ ] No crash / sensing service stays active the whole walk

## Step 4 — One decision you owe yourself (not a code task)

**Is the glasses speaker required for Phase 1, or is phone TTS (Sarvam) the accepted primary audio output?**

Context: the `hifiberry-dac`/`googlevoicehat-soundcard` I²S conflict was addressed in `config.txt` today, but there's no confirmed clean-audio test result yet — the `aplay Front_Center.wav` test that was queued never got its result logged. Two honest paths:

- **A)** Test the speaker fix properly (5 min), and if it's clear, glasses speaker is back in play as a secondary/backup output
- **B)** Just decide phone TTS is good enough for Phase 1 and stop chasing the glasses speaker until the hardware swap (already on your future-phases list)

Either is fine — just pick one so it stops being an open question.

---

## Phase 1 exit checklist (from Cursor, for reference)

**A — must be green to exit:**
A1 Dual ToF detect · A2 Vibration urgency patterns · A3 Settings 1.0–2.5m to hardware · A4 Pause/resume from phone · A5 Instant obstacle photo → History · A6 On-demand Read (**blocked on Gemini**) · A7 Obstacle Gemini naming (**blocked on Gemini**) · A8 Android app tabs (**needs APK install**) · A9 Portable wearable walk · A10 No crash during walk

**Exit gate:** A1–A5 + A8–A10 green, and either A6 works or you formally accept "distance-only + photo, no AI Read" for the demo.

**B — must-fix before calling it closed:** Gemini billing/quota · install latest APK · demo script discipline (unpaused sensing, same Wi-Fi) · the speaker decision above.

---

## After Phase 1 closes — enrichment backlog (not blocking, don't touch until A+B are green)

You're already ahead of brief on some of this — `describe_obstacle()` with its own cooldown and Hinglish obstacle narration is built and live, which technically belongs to this list, not Phase 1.

**Near-term enrichment (C-tier, low effort):**
- Battery % surfaced in app (currently often missing)
- Cleaner History view for demos (hide noisy "All cloud" entries)
- Stronger OpenCV path/edge guidance as a non-Gemini fallback (currently thin)

**Bigger/later (explicitly future, per your own plan doc):**
- Wake word ("Hey Divya Drishti") — phone mic first, glasses mic later
- Glasses speaker as primary output (post hardware swap)
- Color ID / object memory (up to 1k objects)
- GPS / maps / destination routing
- Continuous always-on Gemini (deliberately rejected so far — keep it that way, don't let scope creep back in)
- Miniaturization, custom PCB, casing, certification, mass manufacture

---

## Rules that still apply tomorrow (carrying over, don't relitigate)

- Never edit `/home/pi/divya_drishti_final.py` without showing the diff and getting approval first
- Never stop/restart `divyadrishti-sensing.service`, activate speaker/motors, or reboot the Pi without explicit in-the-moment go-ahead
- Never `git add .` / `-A` — patch-stage only, task-relevant hunks
- Don't push unless asked
- Gemini key stays in terminal/env, never in chat
- Always show real evidence before claiming something's fixed — the speaker "fix" isn't confirmed yet, don't let tomorrow's excitement skip that check

## Suggested order tomorrow

1. Gemini quota fix → confirm via probe script
2. Plug in phone → build/install APK
3. 5-minute walk demo against the A-checklist
4. Make the speaker decision (Step 4)
5. Only then: mark Phase 1 exited, and if there's energy left, start on the C-tier enrichment list
