#!/usr/bin/env -S gjs -m

import GLib from 'gi://GLib';

import {
    activeProfileFromLedStates,
    detectG13ActiveProfile,
    detectG13Components,
    findG13HidrawDevice,
    findG13EventDevices,
    isG13HidDevice,
    parseInputDevices,
    scanForG13,
} from '../src/device-detector.js';

const keypad = `I: Bus=0003 Vendor=046d Product=c21c Version=0111
N: Name="Logitech G13 Gaming Keypad"
H: Handlers=event8
B: EV=3`;

const thumbstick = `I: Bus=0003 Vendor=046D Product=C21C Version=0111
N: Name="Logitech G13 Thumbstick"
H: Handlers=event9 js0
B: EV=b`;

const unrelatedKeyboard = `I: Bus=0003 Vendor=1234 Product=5678 Version=0111
N: Name="G13 Gaming Keypad lookalike"
H: Handlers=kbd event2`;

function assertEqual(actual, expected, description) {
    if (actual !== expected)
        throw new Error(`${description}: expected ${expected}, received ${actual}`);
}

const inventory = `${unrelatedKeyboard}\n\n${keypad}\n\n${thumbstick}\n`;
const devices = parseInputDevices(inventory);
const detected = detectG13Components(inventory);
const eventDevices = findG13EventDevices(inventory, '/test/input');

assertEqual(devices.length, 3, 'parses every input-device block');
assertEqual(detected.keypad, true, 'detects the G13 keypad');
assertEqual(detected.thumbstick, true, 'detects the G13 thumbstick');
assertEqual(
    eventDevices.keypad,
    '/test/input/event8',
    'finds the keypad event device',
);
assertEqual(
    eventDevices.thumbstick,
    '/test/input/event9',
    'finds the thumbstick event device',
);
assertEqual(
    isG13HidDevice('HID_ID=0003:0000046D:0000C21C\n'),
    true,
    'recognizes the G13 HID device',
);
assertEqual(
    isG13HidDevice('HID_ID=0003:0000046D:0000C21D\n'),
    false,
    'rejects a different HID product',
);
assertEqual(
    detectG13Components(keypad).thumbstick,
    false,
    'reports a missing thumbstick independently',
);
assertEqual(
    detectG13Components(unrelatedKeyboard).keypad,
    false,
    'requires the Logitech G13 USB IDs',
);
assertEqual(
    scanForG13('/path/that/does/not/exist').available,
    false,
    'reports an unavailable device inventory',
);
assertEqual(
    activeProfileFromLedStates([
        {name: 'g13:red:macro_preset_1', brightness: '0'},
        {name: 'g13:red:macro_preset_2', brightness: '1'},
        {name: 'g13:red:macro_preset_3', brightness: '0'},
    ]),
    'm2',
    'reads the active hardware profile LED',
);
assertEqual(
    activeProfileFromLedStates([
        {name: 'g13:red:macro_preset_1', brightness: '0'},
        {name: 'g13:red:macro_preset_2', brightness: '0'},
        {name: 'g13:red:macro_preset_3', brightness: '0'},
    ]),
    null,
    'leaves profile selection to the M1 fallback when no LED is active',
);

assertEqual(parseInputDevices('not an input device').length, 0, 'ignores malformed blocks');
assertEqual(
    parseInputDevices('I: Bus=0003 Vendor=046d Product=c21c\nN: Name="Logitech G13 Thumbstick"')[0]
        .handlers.length,
    0,
    'accepts devices without handlers',
);

const sysfsRoot = GLib.dir_make_tmp('g13-detector-sysfs-XXXXXX');
GLib.mkdir_with_parents(`${sysfsRoot}/hidraw0/device`, 0o700);
GLib.mkdir_with_parents(`${sysfsRoot}/hidraw-not-a-number/device`, 0o700);
GLib.file_set_contents(
    `${sysfsRoot}/hidraw0/device/uevent`,
    'HID_ID=0003:0000046D:0000C21C\n',
);
assertEqual(
    findG13HidrawDevice(sysfsRoot, '/test/dev'),
    '/test/dev/hidraw0',
    'finds the matching hidraw device in sysfs',
);
GLib.file_set_contents(
    `${sysfsRoot}/hidraw0/device/uevent`,
    'HID_ID=0003:0000046D:0000C21D\n',
);
assertEqual(
    findG13HidrawDevice(sysfsRoot, '/test/dev'),
    null,
    'rejects a non-G13 hidraw device',
);
assertEqual(
    findG13HidrawDevice(`${sysfsRoot}/missing`, '/test/dev'),
    null,
    'handles an unavailable hidraw inventory',
);

const ledRoot = GLib.dir_make_tmp('g13-detector-led-XXXXXX');
for (const [profile, brightness] of [['1', '0'], ['2', '1'], ['3', '0']]) {
    GLib.mkdir_with_parents(`${ledRoot}/g13:red:macro_preset_${profile}`, 0o700);
    GLib.file_set_contents(
        `${ledRoot}/g13:red:macro_preset_${profile}/brightness`,
        brightness,
    );
}
GLib.mkdir_with_parents(`${ledRoot}/unrelated-led`, 0o700);
assertEqual(detectG13ActiveProfile(ledRoot), 'm2', 'reads profile LEDs from sysfs');
assertEqual(
    detectG13ActiveProfile(`${ledRoot}/missing`),
    null,
    'handles an unavailable LED inventory',
);

const [inventoryFd, inventoryPath] = GLib.file_open_tmp('g13-inventory-XXXXXX');
GLib.close(inventoryFd);
GLib.file_set_contents(inventoryPath, inventory);
const scanned = scanForG13(inventoryPath);
assertEqual(scanned.available, true, 'scans a readable input inventory');
assertEqual(scanned.keypad, true, 'returns detected components from a scan');
GLib.unlink(inventoryPath);

print('device-detector tests passed');
