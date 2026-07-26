-- Divya Drishti companion app — Supabase schema
-- Run this in the Supabase SQL editor for a fresh project.

-- ─────────────────────────────────────────────────────────────
-- devices: one row per physical glasses unit, linked to an owner
-- ─────────────────────────────────────────────────────────────
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  -- Clerk user ID (for example, user_...). Null until a device is claimed.
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
-- Row Level Security — an owner only sees their own device's data.
-- Configure Supabase third-party JWT verification for Clerk before enabling production access.
-- ─────────────────────────────────────────────────────────────
alter table devices enable row level security;
alter table device_status enable row level security;
alter table device_events enable row level security;
alter table device_settings enable row level security;

create policy "Owners can manage their devices"
  on devices for all
  using ((auth.jwt() ->> 'sub') = owner_id)
  with check ((auth.jwt() ->> 'sub') = owner_id);

create policy "Owners can read/write their device status"
  on device_status for all
  using (exists (select 1 from devices d where d.id = device_id and d.owner_id = (auth.jwt() ->> 'sub')))
  with check (exists (select 1 from devices d where d.id = device_id and d.owner_id = (auth.jwt() ->> 'sub')));

create policy "Owners can read/write their device events"
  on device_events for all
  using (exists (select 1 from devices d where d.id = device_id and d.owner_id = (auth.jwt() ->> 'sub')))
  with check (exists (select 1 from devices d where d.id = device_id and d.owner_id = (auth.jwt() ->> 'sub')));

create policy "Owners can read/write their device settings"
  on device_settings for all
  using (exists (select 1 from devices d where d.id = device_id and d.owner_id = (auth.jwt() ->> 'sub')))
  with check (exists (select 1 from devices d where d.id = device_id and d.owner_id = (auth.jwt() ->> 'sub')));

-- Claims a device by its one-time pairing code without making unclaimed devices
-- readable to every signed-in person. See the matching migration for existing projects.
create or replace function public.claim_device(pairing_code_input text)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  claimant text := auth.jwt() ->> 'sub';
  claimed public.devices;
begin
  if claimant is null or claimant = '' then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.devices
  set owner_id = claimant, paired_at = now()
  where pairing_code = upper(trim(pairing_code_input)) and owner_id is null
  returning * into claimed;

  if not found then
    raise exception 'Pairing code is invalid or already linked to a device' using errcode = 'P0002';
  end if;

  return claimed;
end;
$$;

revoke all on function public.claim_device(text) from public;
grant execute on function public.claim_device(text) to authenticated;

-- Enable Realtime on the tables the dashboard subscribes to.
alter publication supabase_realtime add table device_status;
alter publication supabase_realtime add table device_events;
