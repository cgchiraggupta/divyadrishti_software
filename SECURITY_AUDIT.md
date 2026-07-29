# Supabase, RLS, Clerk JWT, and Device Pairing Security Audit

**Repository:** `cgchiraggupta/divyadrishti_software`  
**Branch / commit reviewed:** `main` at `8c18aa4`  
**Audit date:** 2026-07-29  
**Scope:** Repository source and database definitions only. The live Supabase and Clerk dashboards were not accessible from repository files, so dashboard-only settings are identified as verification items rather than assumed to be correct.

## Executive summary

The current default branch is **not safe for production multi-user use**. All four Supabase tables have RLS enabled, but the effective policies use `using (true)` / `with check (true)` for `anon` and `authenticated`. Consequently, RLS is enabled in name but does not isolate devices or users.

The repository contains remnants of a stronger Clerk ownership model (`claim_device`, `owner_id`, and a Clerk token getter), but the later pairing-only migration and current application wiring bypass it. The running app uses the anonymous Supabase role and calls `claim_device_public`; it does not mount Clerk, does not require sign-in, and does not bind a device to a user. Anyone with the public Supabase URL and anon key can query all device rows, statuses, events, and settings, spoof events, and modify settings.

### Severity summary

| Severity | Count | Summary |
| --- | ---: | --- |
| Critical | 3 | Global data access/write policies; unauthenticated reusable claim RPC |
| High | 3 | Clerk/JWT path bypassed; cross-device event/settings access; public pairing-code disclosure |
| Medium | 2 | No brute-force/rate-limit control; hard-coded fallback pairing code on the provisioning service |
| Informational / positive | 3 | RLS enabled on all defined tables; no service-role key found in client; anon key is correctly treated as public configuration |

## What was checked

- `supabase/schema.sql` — all table definitions, RLS enablement, policies, grants, RPCs, and Realtime publication changes.
- `supabase/migrations/20260726173000_add_device_claim_rpc.sql` — authenticated Clerk-subject claim function.
- `supabase/migrations/20260726180000_make_companion_pairing_only.sql` — later policy replacement and anonymous claim function.
- `src/lib/supabaseClient.js` — Supabase client construction and access-token callback.
- `src/context/AuthContext.jsx`, `src/main.jsx`, `src/App.jsx`, `package.json`, and `.env.example` — Clerk provider wiring, dependency/config presence, route protection, and exposed keys.
- `src/context/DeviceContext.jsx` and `src/pages/Pairing.jsx` — lookup, claim, local persistence, Realtime subscriptions, and device-data queries.
- `setup/hardware-integration/divyadrishti-wifi-provisioner.py`, `setup/hardware-integration/divyadrishti_local_link.py`, and `src/services/localDeviceLink.js` — local pairing-code checks and device commands.
- A repository-wide search for `service_role`, service-role environment variables, `auth.uid()`, `auth.jwt()`, JWT/token usage, policy definitions, and pairing/owner fields.

## Findings

### DD-01 — Critical: all device rows and pairing codes are globally readable

**Locations**

- `supabase/schema.sql:69` — policy `Anyone can find glasses by pairing code` uses `using (true)` for `anon, authenticated`.
- `supabase/migrations/20260726180000_make_companion_pairing_only.sql:9` — recreates the same permissive policy and is the final migration in repository order.
- `src/context/DeviceContext.jsx:36` — client-side `.eq('pairing_code', pairingCode)` filtering.

**Risk**

RLS evaluates whether a row may be returned; a client query filter is not an authorization boundary. Because the policy is `using (true)`, an attacker can omit the `.eq(...)` filter and select every row in `devices`, including `id`, `owner_id`, `pairing_code`, timestamps, and device names. Exposed device IDs then unlock the other globally readable/writable tables. The pairing codes can also be reused against the local device service.

**Recommended fix**

Return to authenticated ownership. With Clerk, the subject is text, so compare `owner_id` to `auth.jwt() ->> 'sub'` rather than casting the Clerk user ID to UUID.

```sql
drop policy if exists "Anyone can find glasses by pairing code" on public.devices;

create policy "Owners can read their devices"
on public.devices
for select
to authenticated
using (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners can update their devices"
on public.devices
for update
to authenticated
using (owner_id = (select auth.jwt() ->> 'sub'))
with check (owner_id = (select auth.jwt() ->> 'sub'));

revoke all on public.devices from anon;
grant select, update on public.devices to authenticated;
```

Do not add a general policy that exposes unclaimed rows. Claiming should happen only through the exact-code, authenticated RPC in DD-03.

---

### DD-02 — Critical: status, event, and settings policies allow cross-device reads and writes

**Locations / policy names**

- `supabase/schema.sql:70` — `Anyone can read paired device status`, `using (true)`.
- `supabase/schema.sql:71` — `Anyone can read paired device events`, `using (true)`.
- `supabase/schema.sql:72` — `Anyone can add device events`, `with check (true)`.
- `supabase/schema.sql:73` — `Anyone can read device settings`, `using (true)`.
- `supabase/schema.sql:74` — `Anyone can add device settings`, `with check (true)`.
- `supabase/schema.sql:75` — `Anyone can update device settings`, `using (true) with check (true)`.
- The same policies are recreated in `supabase/migrations/20260726180000_make_companion_pairing_only.sql:11-22`.

**Risk**

Any unauthenticated caller can:

- Read live health/diagnostic state for every device.
- Read every alert, voice-command, SOS, and system event.
- Insert fabricated events against any known device ID, corrupting safety history and potentially triggering Realtime UI behavior.
- Read, insert, or change settings for another device, including sensitivity, volume, and vibration intensity.

This is especially serious for an assistive device because tampered settings or false status can affect user safety.

**Recommended fix**

Remove every anonymous policy and scope child rows through the owning `devices` row. Keep hardware writes out of the browser: send them through a trusted API/Edge Function or device-authenticated backend that holds the service-role key server-side only.

```sql
drop policy if exists "Anyone can read paired device status" on public.device_status;
drop policy if exists "Anyone can read paired device events" on public.device_events;
drop policy if exists "Anyone can add device events" on public.device_events;
drop policy if exists "Anyone can read device settings" on public.device_settings;
drop policy if exists "Anyone can add device settings" on public.device_settings;
drop policy if exists "Anyone can update device settings" on public.device_settings;

create policy "Owners can read device status"
on public.device_status for select to authenticated
using (exists (
  select 1 from public.devices d
  where d.id = device_id
    and d.owner_id = (select auth.jwt() ->> 'sub')
));

create policy "Owners can read device events"
on public.device_events for select to authenticated
using (exists (
  select 1 from public.devices d
  where d.id = device_id
    and d.owner_id = (select auth.jwt() ->> 'sub')
));

create policy "Owners can read device settings"
on public.device_settings for select to authenticated
using (exists (
  select 1 from public.devices d
  where d.id = device_id
    and d.owner_id = (select auth.jwt() ->> 'sub')
));

create policy "Owners can create device settings"
on public.device_settings for insert to authenticated
with check (exists (
  select 1 from public.devices d
  where d.id = device_id
    and d.owner_id = (select auth.jwt() ->> 'sub')
));

create policy "Owners can update device settings"
on public.device_settings for update to authenticated
using (exists (
  select 1 from public.devices d
  where d.id = device_id
    and d.owner_id = (select auth.jwt() ->> 'sub')
))
with check (exists (
  select 1 from public.devices d
  where d.id = device_id
    and d.owner_id = (select auth.jwt() ->> 'sub')
));

revoke all on public.device_status, public.device_events, public.device_settings from anon;
revoke insert, update, delete on public.device_status, public.device_events from authenticated;
grant select on public.device_status, public.device_events to authenticated;
grant select, insert, update on public.device_settings to authenticated;
```

If the companion app must create a non-hardware event, expose a narrow validated RPC rather than granting unrestricted table inserts.

---

### DD-03 — Critical: `claim_device_public` is unauthenticated, reusable, and does not establish ownership

**Locations**

- `supabase/schema.sql:77-101` — `public.claim_device_public(text)` is `security definer` and executable by `anon` and `authenticated`.
- `supabase/migrations/20260726180000_make_companion_pairing_only.sql:24-49` — same final function.
- `src/context/DeviceContext.jsx:141-148` — the app calls `claim_device_public` and stores the submitted code.

**Risk**

The function accepts anonymous requests, selects by a short code, returns the complete device row, and only sets `paired_at`. It does not set `owner_id`, require `owner_id is null`, invalidate/rotate the code, or prevent a second user from calling it. A guessed, leaked, or enumerated code therefore grants repeat access. The function's `security definer` status bypasses RLS, amplifying the problem.

The UI error says the device may already be linked, but the SQL does not reject an already-paired device.

**Recommended fix**

Drop the public function and use one atomic authenticated claim. Harden the definer function with an empty search path and fully qualified object names.

```sql
drop function if exists public.claim_device_public(text);

create or replace function public.claim_device(pairing_code_input text)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimant text := auth.jwt() ->> 'sub';
  claimed public.devices;
  normalized_code text := upper(trim(pairing_code_input));
begin
  if claimant is null or claimant = '' then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if normalized_code !~ '^[A-Z0-9]{6,8}$' then
    raise exception 'Pairing code is invalid' using errcode = '22023';
  end if;

  update public.devices
     set owner_id = claimant,
         paired_at = now()
   where pairing_code = normalized_code
     and owner_id is null
  returning * into claimed;

  if not found then
    raise exception 'Pairing code is invalid or already linked to a device'
      using errcode = 'P0002';
  end if;

  return claimed;
end;
$$;

revoke all on function public.claim_device(text) from public, anon;
grant execute on function public.claim_device(text) to authenticated;
```

Also rotate or invalidate the cloud claim code after successful ownership assignment if the same value is not required for the local link. If the local link needs a credential, use a separate high-entropy per-device secret rather than exposing the cloud claim code in queryable application data.

---

### DD-04 — High: the intended Clerk JWT path is present but bypassed by the running app

**Locations**

- `src/context/AuthContext.jsx:42` requests `getToken({ template: 'supabase' })` and registers it as the Supabase access-token source.
- `src/lib/supabaseClient.js:20-22` supports a dynamic `accessToken` callback.
- `src/main.jsx:1-11` mounts `App` directly, with no `ClerkProvider`.
- `src/App.jsx:1-66` has no `AuthProvider`, `RequireAuth`, or login route.
- `package.json:12-22` does not contain `@clerk/react`.
- `.env.example:1-14` has no Clerk publishable key or Clerk/Supabase integration instructions.
- `supabase/migrations/20260726173000_add_device_claim_rpc.sql:2-34` defines an authenticated claim, but the later migration and client no longer use it.

**Risk**

`accessTokenGetter` remains `null`, so Supabase requests use the anon role. `AuthContext.jsx` is currently dead code and would fail to resolve `@clerk/react` if reintroduced without restoring the dependency. The repository therefore does not implement the Clerk-authenticated design described by the earlier migration.

**Recommended fix**

Choose and document one access model. For a production user-data app, restore Clerk end to end:

1. Add the current Clerk React package and mount `ClerkProvider` at the root.
2. Mount `AuthProvider` around `DeviceProvider` and protect pairing/device routes.
3. Change the client to call `claim_device`, not `claim_device_public`.
4. Configure Supabase's Clerk third-party auth integration for the Clerk instance.
5. With the current native integration, supply the Clerk session token to Supabase with `getToken()`; do not rely on the legacy Supabase JWT template unless the deployed integration explicitly requires that legacy mode.

Example token callback after Clerk is mounted:

```js
setSupabaseAccessTokenGetter(
  isSignedIn ? () => getToken() : null,
)
```

Keep `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, and the Supabase anon/publishable key in the client. Never put a Clerk secret key or Supabase service-role key in a `VITE_` variable.

---

### DD-05 — High: live Clerk JWT verification cannot be proven from the repository

**Locations**

- `supabase/migrations/20260726173000_add_device_claim_rpc.sql:2` states that third-party JWT verification must be configured.
- No `supabase/config.toml` or equivalent checked-in auth configuration exists.
- No test verifies that a Clerk token reaches Supabase as `authenticated` with the expected `sub`.

**Risk**

Dashboard-only configuration can drift or be missing. If Clerk is not enabled as a Supabase third-party auth provider, requests will fail authentication. If the wrong Clerk domain/instance is trusted, valid users may be rejected or tokens from an unintended issuer may be accepted. The current app masks this because it operates anonymously.

**Recommended fix / verification**

- In Supabase Dashboard, enable the Clerk third-party authentication integration for the exact production Clerk instance/domain.
- In Clerk, use the same instance as the published frontend key and verify the authorized origins for web/Capacitor.
- For local Supabase configuration, commit a non-secret configuration entry similar to:

```toml
[auth.third_party.clerk]
enabled = true
domain = "your-instance.clerk.accounts.dev"
```

- Add an integration test that signs in through Clerk, calls a small diagnostic RPC, and asserts:
  - `auth.role()` is `authenticated`;
  - `auth.jwt() ->> 'sub'` equals the Clerk user ID;
  - user A cannot select user B's device ID;
  - anon cannot select any row or execute the claim RPC.

The exact production dashboard value must be checked manually; it is not recoverable from this repository.

---

### DD-06 — High: the final migration reverses the secure ownership migration

**Locations**

- `supabase/migrations/20260726173000_add_device_claim_rpc.sql` adds authenticated `claim_device` using the Clerk `sub` and only claims `owner_id is null`.
- `supabase/migrations/20260726180000_make_companion_pairing_only.sql` runs later, drops owner policies, grants public table access, and creates `claim_device_public`.
- `README.md:48-63` explicitly states that there is no account and that the pairing code is the access key.

**Risk**

The repository contains two incompatible security models. Following the documented migration order leaves the database in the weaker public state. A reviewer may see the secure migration and incorrectly conclude that ownership enforcement is active.

**Recommended fix**

Add one new forward-only migration that drops the public policies/function and creates the ownership policies/function from DD-01 through DD-03. Then update `supabase/schema.sql` to represent the same final state. Do not edit already-applied migration history on a shared project; make the correction in a new timestamped migration.

---

### DD-07 — Medium: pairing relies on a short reusable bearer code without rate limiting

**Locations**

- `supabase/schema.sql:12` stores a short pairing code.
- `src/pages/Pairing.jsx:44-49` accepts 4-8 characters.
- `src/context/DeviceContext.jsx:141-148` calls the RPC directly from the browser.
- No Edge Function, CAPTCHA, attempt counter, lockout, expiry, or rate-limiting implementation was found.

**Risk**

The anon key and RPC endpoint are public by design. Short codes can be brute-forced online, especially when the globally readable `devices` table reveals valid codes directly. Even after DD-01, the claim RPC needs abuse controls because `security definer` performs privileged exact-code lookup.

**Recommended fix**

- Require authentication before claim.
- Prefer a 128-bit random QR/deep-link claim token, store only a hash, and give it a short expiry and one-time-use timestamp.
- Put the claim operation behind an Edge Function/API with per-account and per-IP throttling (for example, five failed attempts per 15 minutes), generic error responses, and security logging.
- If short spoken codes are mandatory for accessibility, combine the short code with an authenticated session, strict attempt limits, expiry, and device-side confirmation.

---

### DD-08 — Medium: Wi-Fi provisioning has a public hard-coded fallback pairing code

**Location**

- `setup/hardware-integration/divyadrishti-wifi-provisioner.py:10` defaults `DIVYADRISHTI_PAIRING_CODE` to `RA46W4`.

**Risk**

If deployment fails to set the environment variable, every affected device accepts the same code published in this repository. A nearby attacker on the setup network could submit Wi-Fi credentials or take over provisioning.

**Recommended fix**

Fail closed when a device-specific code is absent:

```python
PAIRING_CODE = os.environ.get("DIVYADRISHTI_PAIRING_CODE", "").strip().upper()
if not PAIRING_CODE:
    raise RuntimeError("DIVYADRISHTI_PAIRING_CODE must be provisioned per device")
```

Generate a unique, high-entropy secret during manufacturing/first boot; do not use a repository default. Add request throttling and stop the provisioning service after successful setup.

## Areas checked with no issue found

### RLS enablement

`supabase/schema.sql:64-67` enables RLS on every sensitive table defined in the repository: `devices`, `device_status`, `device_events`, and `device_settings`. No defined application table was found with RLS entirely omitted. The problem is the permissive policy expressions, not missing `enable row level security` statements.

### Service-role key exposure

No Supabase service-role key, `SUPABASE_SERVICE_ROLE_KEY`, or equivalent client-side reference was found. `src/lib/supabaseClient.js:3-4` and `.env.example:4-5` use only the Supabase URL and anon key. That is correct: the anon/publishable key may be present in a frontend bundle when RLS is restrictive.

If a service-role key is later introduced for Pi ingestion or an Edge Function, keep it only in a trusted server/device secret store and never under a `VITE_` variable, Android resource, Capacitor bundle, or browser code.

### SQL injection in claim lookup

The claim functions use static SQL with a PL/pgSQL parameter rather than string concatenation. No SQL-injection path was found in the claim query. The defect is authorization and abuse resistance, not query construction.

## Recommended remediation order

1. **Immediately block anonymous table access** and deploy owner-scoped RLS policies.
2. **Drop `claim_device_public`** and allow only authenticated, one-time ownership claims.
3. **Restore and verify Clerk-to-Supabase third-party authentication** in the app and dashboard.
4. **Move device status/event writes behind a trusted ingestion boundary**; never solve this by shipping a service-role key to the app or Pi image.
5. **Rotate existing pairing codes** because the current policy allowed bulk disclosure.
6. **Replace repository/default pairing secrets**, add claim expiry and rate limiting, and test user-to-user isolation.
7. **Consolidate the intended final security model** in a new migration, `schema.sql`, README, and automated authorization tests.

## Minimum authorization test matrix

| Test | Expected result |
| --- | --- |
| Anonymous `select` on each of the four tables | Denied / zero rows |
| Anonymous execution of `claim_device` | Permission denied |
| Authenticated user A claims an unowned valid code | Exactly one device becomes owned by A |
| User B retries A's claimed code | Generic invalid/already-claimed error |
| User A reads A's device/status/events/settings | Allowed |
| User A reads or changes B's rows by known UUID | Denied / zero rows |
| User changes `owner_id` during update | Denied by `with check` |
| Browser attempts to insert status/events directly | Denied unless a narrowly scoped product requirement explicitly allows it |
| Realtime subscription for another user's device ID | Receives no rows/events |
| Clerk token diagnostic | `authenticated` role and expected Clerk `sub` |

## Reference configuration guidance

- Supabase third-party auth with Clerk: https://supabase.com/docs/guides/auth/third-party/clerk
- Supabase RLS guidance: https://supabase.com/docs/guides/database/postgres/row-level-security
- Clerk Supabase integration: https://clerk.com/docs/integrations/databases/supabase

These references describe the current integration model; production dashboard values still require direct verification.
