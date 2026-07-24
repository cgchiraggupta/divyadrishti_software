# Divya Drishti — Companion App

A companion app for the Divya Drishti assistive glasses: pair a device, watch live status,
review alert history, and tune how it alerts you. Built as a React web app (Vite + Tailwind +
Supabase), packaged for Android with Capacitor.

## Stack

- **Vite + React** — app shell
- **Tailwind CSS v4** — styling, via a small design-token theme in `src/index.css`
- **React Router** — navigation
- **Supabase** — auth (Google OAuth), Postgres database, and Realtime for live device status
- **Capacitor** *(added in a later phase)* — wraps the same codebase into an Android app

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor — creates `devices`, `device_status`,
   `device_events`, `device_settings`, plus Row Level Security policies scoped to the
   authenticated owner, and enables Realtime on `device_status` / `device_events`.
3. Enable the Google provider under **Authentication → Providers**.
4. Copy your project URL + anon key into `.env`.

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
  context/      AuthContext (Supabase auth), DeviceContext (paired device + Realtime status/events)
  lib/          supabaseClient.js, format.js (labels/timestamps)
  pages/        Login, Pairing, Dashboard, History, Settings, Diagnostics
supabase/
  schema.sql    Full database schema + RLS policies
```

## Roadmap

Short version of the phased plan:

- [x] Phase A — foundation: scaffold, auth, routing, Supabase schema
- [x] Phase B (partial) — dashboard/history/settings/diagnostics UI wired to Supabase reads + Realtime
- [ ] Phase B (remaining) — Pi-side script pushing real status/events into Supabase
- [ ] Phase D — Capacitor + Android build
- [ ] Phase E — QR-code pairing flow, push notifications, caregiver accounts

## Design notes

Palette and type system are defined as CSS variables in `src/index.css` (`@theme` block) —
a deep "night navigation" palette (indigo background, amber signal accent, green/red for
safe/hazard states) with Space Grotesk for headings, Inter for body text, and JetBrains Mono
for data readouts (distances, timestamps, IDs). The signature UI element is the pulse ring
around the connection indicator (`StatusPulse` component), echoing the device's own ToF
sensing behaviour; it respects `prefers-reduced-motion`.
