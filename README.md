# Divya Drishti — Companion App

A companion app for the Divya Drishti assistive glasses: pair a device, watch live status,
review alert history, and tune how it alerts you. Built as a React web app (Vite + Tailwind +
Clerk + Supabase), packaged for Android with Capacitor.

## Stack

- **Vite + React** — app shell
- **Tailwind CSS v4** — styling, via a small design-token theme in `src/index.css`
- **React Router** — navigation
- **Clerk** — user authentication
- **Supabase** — Postgres database and Realtime for live device status
- **Capacitor** — Android app shell (`com.divyadrishti.app`)

## Getting started

```bash
npm install
cp .env.example .env   # fill in Clerk + Supabase public configuration
npm run dev
```

### Local demo mode (no authentication)

For UI testing without Supabase or authentication, set `VITE_DEMO_MODE=true` in `.env` and restart
the dev server. The app opens with a local sample device, status, and alert history; no account or
remote data is used. Set it back to `false` before connecting a real device or building for release.

Preview mode is a consumer-facing simulated walk, not a developer console. It includes realistic
guidance outcomes such as a clear path, an object ahead with distance, right-side obstacles, and
uneven ground. Each choice updates the live guidance card and saved activity history so the same
experience can later be driven by Pi/Supabase data.

### Android development

The Android Capacitor project is in `android/`. Build and copy the current web app into it with:

```bash
npm run android:sync
```

To create a debug APK on a machine with the Android SDK configured:

```bash
npm run android:build
```

## Authentication setup

Clerk replaces the former Supabase Google OAuth client flow. Add your Clerk publishable key as
`VITE_CLERK_PUBLISHABLE_KEY`; the Vite entrypoint loads `ClerkProvider` outside demo mode.

Configure a Clerk JWT template named `supabase` before using real Supabase data. The app passes
that session token to Supabase for authenticated requests.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor — creates `devices`, `device_status`,
   `device_events`, `device_settings`, plus Row Level Security policies scoped to the Clerk user,
   and enables Realtime on `device_status` / `device_events`.
3. Configure Supabase third-party JWT verification for Clerk so the JWT
   `sub` claim is available to the Row Level Security policies.
4. Copy your Supabase project URL and anon key into `.env`, and set `VITE_DEMO_MODE=false`.

## Pairing model

Each physical device is expected to insert its own row into `devices` on first boot
(with a `pairing_code`, `owner_id = null`). The app's Pairing screen looks up that code
and claims the device by setting `owner_id` to the signed-in user. The Raspberry Pi side
of this (generating a code, writing it to Supabase) is a small addition to the existing
`divya_drishti_final.py` script — not yet wired up in this repo.

## Project structure

```
src/
  components/   Layout, BottomNav, Card, Button, StatusPulse (signature live-sensing indicator)
  context/      AuthContext (Clerk auth/demo), DeviceContext (paired device + Realtime status/events)
  lib/          supabaseClient.js, format.js (labels/timestamps)
  pages/        Login, Pairing, Dashboard, History, Settings, Diagnostics
supabase/
  schema.sql    Full database schema + RLS policies
```

## Roadmap

Short version of the phased plan:

- [x] Foundation — scaffold, Clerk auth boundary, routing, Supabase schema, and local demo mode
- [x] Companion UI — dashboard, history, settings, diagnostics, and pairing screens
- [x] Android shell — Capacitor configured and synced to an Android native project
- [ ] Now — complete the polished preview experience: simulated pairing, Wi-Fi setup, connection
  state, alerts, object-recognition outcomes, and command acknowledgements
- [ ] Now — complete Clerk-to-Supabase session/RLS setup and test the Android APK on a device
- [ ] Hardware integration — BLE pairing/Wi-Fi provisioning and Pi-side status, event, command,
  and pairing integration; see `setup/hardware-integration/`
- [ ] Vision upgrade — object/sign recognition and OCR, with safe obstacle-and-distance fallback
  for “What is ahead?”
- [ ] Deferred only — push notifications; see `deferred/push-notifications/`

## Design notes

Palette and type system are defined as CSS variables in `src/index.css` (`@theme` block) —
a deep "night navigation" palette (indigo background, amber signal accent, green/red for
safe/hazard states) with Space Grotesk for headings, Inter for body text, and JetBrains Mono
for data readouts (distances, timestamps, IDs). The signature UI element is the pulse ring
around the connection indicator (`StatusPulse` component), echoing the device's own ToF
sensing behaviour; it respects `prefers-reduced-motion`.
