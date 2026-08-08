#!/bin/bash
# Reliably configure and start Divya Drishti BLE advertising.
# bluetoothctl submenu commands are flaky over bare pipes/PTYs under systemd;
# a shell heredoc is the path that consistently plants the service UUID on
# Pi Zero W + BlueZ 5.82.
set -e
bluetoothctl <<EOF
power on
advertise off
menu advertise
clear
uuids 5f3e0001-2a11-4b0e-9c3a-1f2e3d4c5b6a
name DD
discoverable on
uuids
name
back
advertise on
quit
EOF
busctl get-property org.bluez /org/bluez/hci0 org.bluez.LEAdvertisingManager1 ActiveInstances
