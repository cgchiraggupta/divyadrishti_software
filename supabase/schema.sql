-- Divya Drishti companion app — Supabase schema
-- Run this in the Supabase SQL editor for a fresh project.

-- ─────────────────────────────────────────────────────────────
-- devices: one row per physical glasses unit, linked to an owner
-- ─────────────────────────────────────────────────────────────
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  -- Reserved for a future optional account/owner model.
  owner_id text,
  name text not null default 'Divya Drishti',
  pairing_code text unique, -- short code shown/printed on the Pi during setup
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- device_status: latest known state, one row per device (upserted)
-- ─────────────────────────────────────────────────────────────
create table if not exists device_status (
  device_id uuid primary key references devices(id) on delete cascade,
  battery_pct numeric,
  tof_left_ok boolean,
  tof_right_ok boolean,
  camera_ok boolean,
  mic_ok boolean,
  mode text check (mode in ('tof', 'camera_fallback', 'unknown')) default 'unknown',
  current_alert text, -- e.g. 'path_clear', 'obstacle_ahead', 'obstacle_left', ...
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- device_events: append-only log of alerts, voice commands, etc.
-- ─────────────────────────────────────────────────────────────
create table if not exists device_events (
  id bigint generated always as identity primary key,
  device_id uuid not null references devices(id) on delete cascade,
  event_type text not null, -- 'obstacle_ahead' | 'obstacle_left' | 'obstacle_right'
                             -- | 'uneven_ground' | 'voice_command' | 'sos' | 'system'
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists device_events_device_id_created_at_idx
  on device_events (device_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- device_settings: user-configurable behaviour, one row per device
-- ─────────────────────────────────────────────────────────────
create table if not exists device_settings (
  device_id uuid primary key references devices(id) on delete cascade,
  sensitivity_mm integer not null default 800,
  feedback_mode text check (feedback_mode in ('audio', 'vibration', 'both')) default 'both',
  volume integer not null default 70 check (volume between 0 and 100),
  vibration_intensity integer not null default 70 check (vibration_intensity between 0 and 100),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security — pairing-first public companion app.
-- The app does not require an account. The pairing code is the device access key.
-- ─────────────────────────────────────────────────────────────
alter table devices enable row level security;
alter table device_status enable row level security;
alter table device_events enable row level security;
alter table device_settings enable row level security;

create policy "Anyone can find glasses by pairing code" on devices for select to anon, authenticated using (true);
create policy "Anyone can read paired device status" on device_status for select to anon, authenticated using (true);
create policy "Anyone can read paired device events" on device_events for select to anon, authenticated using (true);
create policy "Anyone can add device events" on device_events for insert to anon, authenticated with check (true);
create policy "Anyone can read device settings" on device_settings for select to anon, authenticated using (true);
create policy "Anyone can add device settings" on device_settings for insert to anon, authenticated with check (true);
create policy "Anyone can update device settings" on device_settings for update to anon, authenticated using (true) with check (true);

create or replace function public.claim_device_public(pairing_code_input text)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.devices;
begin
  select * into claimed from public.devices
  where pairing_code = upper(trim(pairing_code_input));

  if not found then
    raise exception 'Pairing code is invalid' using errcode = 'P0002';
  end if;

  update public.devices set paired_at = coalesce(paired_at, now())
  where id = claimed.id returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_device_public(text) from public;
grant execute on function public.claim_device_public(text) to anon, authenticated;

-- Enable Realtime on the tables the dashboard subscribes to.
alter publication supabase_realtime add table device_status;
alter publication supabase_realtime add table device_events;
