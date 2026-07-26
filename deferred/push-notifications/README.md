# Push notifications - deferred

This is the only postponed feature retained for future work. It is paused until the Raspberry Pi
can reliably publish live status and events to the backend.

## Intended outcome

Send a push notification to the signed-in device owner for configured high-priority events, such as
an SOS trigger, sustained offline state, or a device fault. Normal obstacle alerts must remain local
to the glasses and should not create phone-notification noise.

## Resume criteria

1. The Pi sends authenticated status and event records to Supabase.
2. The Android Capacitor app exists and can register a native notification token.
3. Event severity and owner mapping have been verified end-to-end.

## Future implementation boundary

- Store notification preferences and device tokens in the backend.
- Trigger delivery from a trusted server-side function, never from the Pi or browser client.
- Support Android first; decide iOS support when Capacitor packaging begins.

There is intentionally no notification code in this folder yet. No hardware-backed event stream
exists to test it safely.
