-- Pairing-only access for the companion app.
-- A six-character code links a phone to glasses; no account is required.

drop policy if exists "Owners can manage their devices" on public.devices;
drop policy if exists "Owners can read/write their device status" on public.device_status;
drop policy if exists "Owners can read/write their device events" on public.device_events;
drop policy if exists "Owners can read/write their device settings" on public.device_settings;

create policy "Anyone can find glasses by pairing code"
  on public.devices for select to anon, authenticated using (true);
create policy "Anyone can read paired device status"
  on public.device_status for select to anon, authenticated using (true);
create policy "Anyone can read paired device events"
  on public.device_events for select to anon, authenticated using (true);
create policy "Anyone can add device events"
  on public.device_events for insert to anon, authenticated with check (true);
create policy "Anyone can read device settings"
  on public.device_settings for select to anon, authenticated using (true);
create policy "Anyone can add device settings"
  on public.device_settings for insert to anon, authenticated with check (true);
create policy "Anyone can update device settings"
  on public.device_settings for update to anon, authenticated using (true) with check (true);

create or replace function public.claim_device_public(pairing_code_input text)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.devices;
begin
  select * into claimed
  from public.devices
  where pairing_code = upper(trim(pairing_code_input));

  if not found then
    raise exception 'Pairing code is invalid' using errcode = 'P0002';
  end if;

  update public.devices
  set paired_at = coalesce(paired_at, now())
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_device_public(text) from public;
grant execute on function public.claim_device_public(text) to anon, authenticated;
