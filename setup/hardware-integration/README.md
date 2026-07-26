# Hardware integration plan

This is the implementation contract for connecting the polished companion app to the Divya Drishti
glasses once the hardware is available. It is separate from `deferred/`, because these are core
product features rather than optional future ideas.

## Connection model

1. **Bluetooth Low Energy (BLE)** handles nearby-device discovery, first-time pairing, and secure
   Wi-Fi provisioning.
2. **Wi-Fi + Supabase** handles normal day-to-day communication: live device status, alerts,
   history, settings, and commands. The app must not depend on a permanent Bluetooth connection.
3. The physical device displays or speaks a pairing code; the app claims that device after the user
   enters or scans the code.

## Wi-Fi setup

The app should guide a user through connecting the glasses to their home Wi-Fi over BLE. The Pi
receives the selected network credentials, attempts the connection, and reports success or a clear
failure state. A temporary device hotspot/captive portal is the fallback if BLE provisioning is not
available on the final hardware.

## App and device communication

The Pi will publish the following to Supabase after it is connected:

- Current status: battery, connectivity, ToF health, camera health, microphone health, sensing
  mode, latest alert, and timestamp.
- Event history: obstacle direction, uneven ground, distance, voice commands, faults, and
  connection changes.
- Command acknowledgements: self-test, settings applied, Wi-Fi setup result, and future actions.

The app will send settings and commands through an authenticated command channel. The exact
`device_commands` schema and Pi polling/acknowledgement behavior will be added when the hardware
team confirms its preferred transport.

## Vision and voice behavior

Current reported behavior is safety detection, not object recognition:

- “Obstacle ahead/right/left” and “uneven ground” come from ToF/CV safety logic.
- “What is ahead?” currently reports the detected hazard and its distance.
- It does **not** identify what the object is.

Planned upgrade: camera-based object/sign recognition and OCR. When confidence is high, “What is
ahead?” should answer with object name, direction, and distance, for example: “Chair ahead, about
one metre away.” When recognition is unavailable or uncertain, it must safely fall back to:
“Obstacle ahead, about 60 centimetres away.”

## Demo now, hardware later

The app's preview mode will simulate BLE pairing, Wi-Fi setup, live connection state, obstacle
alerts, object-recognition results, failures, and command acknowledgements. The user-facing app
will call the same data/command interface in both modes; only the simulated provider is replaced
when the Pi arrives.

## Information needed from the hardware team later

- Confirmation that the Pi exposes BLE and its GATT service/characteristic contract.
- The preferred Wi-Fi provisioning method: BLE or temporary hotspot.
- Pairing-code generation and display/speech behavior.
- A safe device-side authentication/provisioning design for Supabase.
- Final Pi status, event, command, and acknowledgement payload examples.
- The supported vision model/API and whether object recognition/OCR runs locally or in the cloud.
