-- Claim an unpaired device without exposing unclaimed rows through RLS.
-- Requires Supabase third-party JWT verification to be configured for Clerk.
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
  set owner_id = claimant,
      paired_at = now()
  where pairing_code = upper(trim(pairing_code_input))
    and owner_id is null
  returning * into claimed;

  if not found then
    raise exception 'Pairing code is invalid or already linked to a device'
      using errcode = 'P0002';
  end if;

  return claimed;
end;
$$;

revoke all on function public.claim_device(text) from public;
grant execute on function public.claim_device(text) to authenticated;
