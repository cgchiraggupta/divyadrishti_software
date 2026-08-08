#!/usr/bin/env python3
"""GPIO25 main control button for Divya Drishti.

The button is wired between GPIO25 and ground.  It is deliberately separate
from the sensing process: it only asks systemd to start sensing on a tap, and
never owns the camera, ToF buses, motors, or speaker.
"""

import logging
import signal
import subprocess
import threading
import time

from gpiozero import Button


GPIO_PIN = 25
TAP_MAX_SECONDS = 1.5
SHUTDOWN_MIN_SECONDS = 3.0
SHUTDOWN_MAX_SECONDS = 7.0
REBOOT_MIN_SECONDS = 8.0


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("divyadrishti-control-button")

press_time = None
press_lock = threading.Lock()
stop_event = threading.Event()


def run_systemctl(*args: str) -> None:
    """Run systemctl directly; this service runs as root."""
    command = ["systemctl", *args]
    logger.info("Running: %s", " ".join(command))
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as error:
        logger.exception("Command failed with exit code %s: %s", error.returncode, " ".join(command))


def on_pressed() -> None:
    global press_time
    with press_lock:
        press_time = time.monotonic()
    logger.info("Button pressed")


def on_released() -> None:
    global press_time
    with press_lock:
        started_at = press_time
        press_time = None

    if started_at is None:
        logger.warning("Ignoring release with no recorded press")
        return

    held_seconds = time.monotonic() - started_at
    logger.info("Button released after %.2f seconds", held_seconds)

    if held_seconds < TAP_MAX_SECONDS:
        logger.info("Tap detected; starting divyadrishti-sensing.service")
        run_systemctl("start", "divyadrishti-sensing.service")
    elif SHUTDOWN_MIN_SECONDS <= held_seconds <= SHUTDOWN_MAX_SECONDS:
        logger.warning("Shutdown hold detected; requesting safe poweroff")
        run_systemctl("poweroff")
    elif held_seconds >= REBOOT_MIN_SECONDS:
        logger.warning("Reboot hold detected; requesting reboot")
        run_systemctl("reboot")
    else:
        logger.info("Dead-zone hold (%.2f seconds); no action taken", held_seconds)


def request_stop(_signal_number: int, _frame: object) -> None:
    logger.info("Stopping control-button daemon")
    stop_event.set()


def main() -> None:
    button = Button(GPIO_PIN, pull_up=True, bounce_time=0.05)
    button.when_pressed = on_pressed
    button.when_released = on_released

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    logger.info("Watching GPIO%d (pull-up enabled, 50 ms debounce)", GPIO_PIN)

    stop_event.wait()
    button.close()


if __name__ == "__main__":
    main()
