-- Cloud-to-glasses settings protocol for the private prototype.
--
-- The companion submits one full settings snapshot. The Pi atomically claims
-- it, validates and persists it locally, then acknowledges that exact request.
-- device_settings represents only values confirmed by the Pi.

alter table public.device_settings
  alter column sensitivity_mm set default 2000;

alter table public.device_settings
  add column if not exists revision bigint not null default 0,
  add column if not exists applied_at timestamptz,
  add column if not exists last_request_id uuid,
  add column if not exists pi_version text;

create table if not exists public.device_setting_requests (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  client_request_id uuid not null unique,
  base_revision bigint not null default 0,
  sensitivity_mm integer not null check (sensitivity_mm between 1000 and 2500),
  feedback_mode text not null check (feedback_mode in ('audio', 'vibration', 'both')),
  volume integer not null check (volume between 20 and 100),
  vibration_intensity integer not null check (vibration_intensity between 40 and 100),
  state text not null default 'queued' check (state in ('queued', 'received', 'applying', 'applied', 'rejected', 'failed', 'superseded')),
  requested_at timestamptz not null default now(),
  received_at timestamptz,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  applied_at timestamptz,
  completed_at timestamptz,
  applied_revision bigint,
  error_code text,
  error_message text
);

-- Covers projects created from the earlier schema snapshot too.
alter table public.device_setting_requests
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists device_setting_requests_pending_idx
  on public.device_setting_requests (device_id, requested_at)
  where state = 'queued';

-- One Pi process may own a live request at a time. An expired lease can be
-- claimed again after a crash, using the same request ID.
create unique index if not exists device_setting_requests_one_applying_per_device_idx
  on public.device_setting_requests (device_id)
  where state = 'applying';

alter table public.device_setting_requests enable row level security;

-- Pairing-only prototype policy. This is not public-release authorization;
-- device ownership/authentication must replace it before public launch.
drop policy if exists "Anyone can read prototype setting requests"
  on public.device_setting_requests;
create policy "Anyone can read prototype setting requests"
  on public.device_setting_requests for select to anon, authenticated using (true);

-- Settings cannot be written directly. The app requests and observes; the Pi
-- alone confirms a hardware-applied snapshot through the two service RPCs.
drop policy if exists "Anyone can add device settings" on public.device_settings;
drop policy if exists "Anyone can update device settings" on public.device_settings;

create or replace function public.request_device_settings(
  pairing_code_input text,
  client_request_id_input uuid,
  sensitivity_mm_input integer,
  feedback_mode_input text,
  volume_input integer,
  vibration_intensity_input integer,
  base_revision_input bigint default 0
)
returns setof public.device_setting_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_device public.devices;
  existing_request public.device_setting_requests;
  created_request public.device_setting_requests;
  current_revision bigint := 0;
begin
  if client_request_id_input is null then
    raise exception 'A request ID is required' using errcode = '22023';
  end if;
  if sensitivity_mm_input not between 1000 and 2500 then
    raise exception 'Detection range must be between 1000 and 2500 mm' using errcode = '22023';
  end if;
  if feedback_mode_input not in ('audio', 'vibration', 'both') then
    raise exception 'Unsupported feedback mode' using errcode = '22023';
  end if;
  if volume_input not between 20 and 100 then
    raise exception 'Volume must be between 20 and 100' using errcode = '22023';
  end if;
  if vibration_intensity_input not between 40 and 100 then
    raise exception 'Vibration intensity must be between 40 and 100' using errcode = '22023';
  end if;

  -- Serialize all requests for the same glasses before inspecting revision or
  -- superseding a queued snapshot.
  select * into target_device
  from public.devices
  where pairing_code = upper(trim(pairing_code_input))
  for update;

  if not found then
    raise exception 'Device pairing code is invalid' using errcode = 'P0002';
  end if;

  select * into existing_request
  from public.device_setting_requests
  where client_request_id = client_request_id_input;

  if found then
    if existing_request.device_id <> target_device.id then
      raise exception 'Request ID belongs to another device' using errcode = '22023';
    end if;
    return next existing_request;
    return;
  end if;

  select revision into current_revision
  from public.device_settings
  where device_id = target_device.id;
  current_revision := coalesce(current_revision, 0);

  if coalesce(base_revision_input, 0) <> current_revision then
    raise exception 'Settings changed on the glasses. Refresh and try again.' using errcode = '40001';
  end if;

  -- A newer save replaces only work the Pi has not started. An applying
  -- request remains leased and cannot be silently overwritten.
  update public.device_setting_requests
  set state = 'superseded', completed_at = now(),
      error_code = 'superseded', error_message = 'Replaced by a newer settings request.'
  where device_id = target_device.id and state = 'queued';

  begin
    insert into public.device_setting_requests (
      device_id, client_request_id, base_revision, sensitivity_mm,
      feedback_mode, volume, vibration_intensity
    ) values (
      target_device.id, client_request_id_input, current_revision,
      sensitivity_mm_input, feedback_mode_input, volume_input,
      vibration_intensity_input
    ) returning * into created_request;
  exception when unique_violation then
    select * into existing_request
    from public.device_setting_requests
    where client_request_id = client_request_id_input;
    if found and existing_request.device_id = target_device.id then
      return next existing_request;
      return;
    end if;
    raise;
  end;

  return next created_request;
end;
$$;

create or replace function public.claim_next_device_setting_request(device_id_input uuid)
returns setof public.device_setting_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_device public.devices;
  candidate public.device_setting_requests;
  current_revision bigint := 0;
begin
  -- Take locks in the same order as request/ack to avoid races and deadlocks.
  select * into target_device from public.devices where id = device_id_input for update;
  if not found then
    raise exception 'Device was not found' using errcode = 'P0002';
  end if;

  select revision into current_revision
  from public.device_settings
  where device_id = target_device.id;
  current_revision := coalesce(current_revision, 0);

  -- A request based on an older confirmed state must never reach hardware.
  update public.device_setting_requests
  set state = 'rejected', completed_at = now(),
      error_code = 'revision_conflict',
      error_message = 'A newer setting was already confirmed on the glasses.'
  where device_id = target_device.id
    and state = 'queued'
    and base_revision <> current_revision;

  -- Reclaim an expired lease first. The Pi persists the request ID before it
  -- changes runtime state, so replaying this same snapshot is idempotent.
  select * into candidate
  from public.device_setting_requests
  where device_id = target_device.id
    and state = 'applying'
  order by claimed_at asc nulls first
  limit 1
  for update;

  if found then
    if candidate.lease_expires_at is not null and candidate.lease_expires_at > now() then
      return;
    end if;
  else
    select * into candidate
    from public.device_setting_requests
    where device_id = target_device.id and state = 'queued'
    order by requested_at asc
    limit 1
    for update skip locked;
    if not found then
      return;
    end if;
  end if;

  if candidate.base_revision <> current_revision then
    update public.device_setting_requests
    set state = 'rejected', completed_at = now(), lease_expires_at = null,
        error_code = 'revision_conflict',
        error_message = 'A newer setting was already confirmed on the glasses.'
    where id = candidate.id
    returning * into candidate;
    return next candidate;
    return;
  end if;

  update public.device_setting_requests
  set state = 'applying',
      received_at = coalesce(received_at, now()),
      claimed_at = now(),
      lease_expires_at = now() + interval '2 minutes',
      error_code = null,
      error_message = null
  where id = candidate.id
  returning * into candidate;

  return next candidate;
end;
$$;

create or replace function public.ack_device_setting_request(
  request_id_input uuid,
  success_input boolean,
  pi_version_input text default null,
  error_code_input text default null,
  error_message_input text default null
)
returns setof public.device_setting_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.device_setting_requests;
  target_device public.devices;
  current_revision bigint := 0;
  applied_revision_value bigint;
begin
  select * into request_row
  from public.device_setting_requests
  where id = request_id_input
  for update;

  if not found then
    raise exception 'Settings request was not found' using errcode = 'P0002';
  end if;

  select * into target_device
  from public.devices
  where id = request_row.device_id
  for update;

  if request_row.state in ('applied', 'rejected', 'failed', 'superseded') then
    return next request_row;
    return;
  end if;

  if request_row.state <> 'applying' then
    raise exception 'Settings request has not been claimed by the glasses' using errcode = '55000';
  end if;

  select revision into current_revision
  from public.device_settings
  where device_id = request_row.device_id;
  current_revision := coalesce(current_revision, 0);

  if not success_input then
    update public.device_setting_requests
    set state = 'failed', completed_at = now(), lease_expires_at = null,
        error_code = coalesce(error_code_input, 'apply_failed'),
        error_message = coalesce(error_message_input, 'The glasses could not apply this setting.')
    where id = request_row.id
    returning * into request_row;
    return next request_row;
    return;
  end if;

  if request_row.base_revision <> current_revision then
    update public.device_setting_requests
    set state = 'rejected', completed_at = now(), lease_expires_at = null,
        error_code = 'revision_conflict',
        error_message = 'A newer setting was already confirmed on the glasses.'
    where id = request_row.id
    returning * into request_row;
    return next request_row;
    return;
  end if;

  insert into public.device_settings (
    device_id, sensitivity_mm, feedback_mode, volume, vibration_intensity,
    revision, applied_at, last_request_id, pi_version, updated_at
  ) values (
    request_row.device_id, request_row.sensitivity_mm, request_row.feedback_mode,
    request_row.volume, request_row.vibration_intensity, current_revision + 1,
    now(), request_row.id, pi_version_input, now()
  )
  on conflict (device_id) do update set
    sensitivity_mm = excluded.sensitivity_mm,
    feedback_mode = excluded.feedback_mode,
    volume = excluded.volume,
    vibration_intensity = excluded.vibration_intensity,
    revision = public.device_settings.revision + 1,
    applied_at = excluded.applied_at,
    last_request_id = excluded.last_request_id,
    pi_version = excluded.pi_version,
    updated_at = excluded.updated_at
  returning revision into applied_revision_value;

  update public.device_setting_requests
  set state = 'applied', applied_at = now(), completed_at = now(),
      lease_expires_at = null, applied_revision = applied_revision_value,
      error_code = null, error_message = null
  where id = request_row.id
  returning * into request_row;

  return next request_row;
end;
$$;

revoke all on function public.request_device_settings(text, uuid, integer, text, integer, integer, bigint) from public;
grant execute on function public.request_device_settings(text, uuid, integer, text, integer, integer, bigint) to anon, authenticated;

revoke all on function public.claim_next_device_setting_request(uuid) from public;
grant execute on function public.claim_next_device_setting_request(uuid) to service_role;

revoke all on function public.ack_device_setting_request(uuid, boolean, text, text, text) from public;
grant execute on function public.ack_device_setting_request(uuid, boolean, text, text, text) to service_role;

do $$
begin
  alter publication supabase_realtime add table public.device_setting_requests;
exception
  when duplicate_object then null;
end;
$$;
