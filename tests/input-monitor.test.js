#!/usr/bin/env -S gjs -m

import GLib from 'gi://GLib';

import {
    ABS_X,
    decodeG13HidReport,
    decodeInputEvent,
    EVENT_TYPE_ABSOLUTE,
    EVENT_TYPE_KEY,
    G13InputMonitor,
    G13_KEY_CONTROLS,
    inputEventSize,
    thumbDirections,
} from '../src/input-monitor.js';

function assertEqual(actual, expected, description) {
    if (actual !== expected)
        throw new Error(`${description}: expected ${expected}, received ${actual}`);
}

function makeInputEvent(type, code, value, longSize = 8) {
    const bytes = new Uint8Array(inputEventSize(longSize));
    const view = new DataView(bytes.buffer);
    const dataOffset = longSize * 2;
    view.setUint16(dataOffset, type, true);
    view.setUint16(dataOffset + 2, code, true);
    view.setInt32(dataOffset + 4, value, true);
    return bytes;
}

const keyEvent = decodeInputEvent(
    makeInputEvent(EVENT_TYPE_KEY, 0x290, 1),
    8,
    true,
);
const axisEvent = decodeInputEvent(
    makeInputEvent(EVENT_TYPE_ABSOLUTE, ABS_X, 42),
    8,
    true,
);
const rawReport = new Uint8Array([
    1, 20, 30, 0x01, 0, 0x20, 0x20, 0x28,
]);
const rawSnapshot = decodeG13HidReport(rawReport);

assertEqual(keyEvent.type, EVENT_TYPE_KEY, 'decodes a key-event type');
assertEqual(keyEvent.code, 0x290, 'decodes a key-event code');
assertEqual(keyEvent.value, 1, 'decodes a key press');
assertEqual(axisEvent.value, 42, 'decodes an absolute-axis value');
assertEqual(rawSnapshot.x, 20, 'decodes the raw thumbstick X axis');
assertEqual(rawSnapshot.y, 30, 'decodes the raw thumbstick Y axis');
assertEqual(rawSnapshot.controls.g1, true, 'decodes a raw G-key press');
assertEqual(rawSnapshot.controls.g22, true, 'decodes the final raw G-key');
assertEqual(rawSnapshot.controls.m1, true, 'decodes a raw mode-key press');
assertEqual(rawSnapshot.controls.backlight, true, 'decodes the backlight key');
assertEqual(rawSnapshot.backlightOn, false, 'decodes the hardware backlight state');
assertEqual(
    rawSnapshot.controls['thumb-press'],
    true,
    'decodes a raw thumbstick click',
);
assertEqual(G13_KEY_CONTROLS.get(0x290), 'g1', 'maps G1');
assertEqual(G13_KEY_CONTROLS.get(0x2a5), 'g22', 'maps G22');
assertEqual(G13_KEY_CONTROLS.get(0x2b3), 'm1', 'maps M1');
assertEqual(
    G13_KEY_CONTROLS.get(0x121),
    'thumb-press',
    'maps the thumbstick click',
);

const centered = thumbDirections(128, 128);
const upperLeft = thumbDirections(20, 30);
assertEqual(centered.left, false, 'keeps a centered stick inactive');
assertEqual(centered.up, false, 'keeps a centered stick inactive');
assertEqual(upperLeft.left, true, 'detects thumbstick left');
assertEqual(upperLeft.up, true, 'detects thumbstick up');
assertEqual(upperLeft.right, false, 'does not activate the opposite direction');

const backlightReport = rawReport.slice();
backlightReport[5] |= 0x80;
assertEqual(
    decodeG13HidReport(backlightReport).backlightOn,
    true,
    'decodes the hardware backlight on state',
);

const [temporaryFd, temporaryPath] = GLib.file_open_tmp(
    'g13-input-event-test-XXXXXX',
);
GLib.close(temporaryFd);
GLib.file_set_contents(
    temporaryPath,
    makeInputEvent(EVENT_TYPE_KEY, 0x290, 1),
);

const loop = new GLib.MainLoop(null, false);
let streamedEvent = null;
const monitor = new G13InputMonitor({
    onEvent: (_kind, event) => {
        streamedEvent = event;
        loop.quit();
    },
    onAccessChanged: () => {},
});
monitor.sync({
    hidrawDevice: null,
    eventDevices: {keypad: temporaryPath, thumbstick: null},
});
const timeout = GLib.timeout_add(
    GLib.PRIORITY_DEFAULT,
    1000,
    () => {
        loop.quit();
        return GLib.SOURCE_REMOVE;
    },
);
loop.run();
monitor.stop();
GLib.source_remove(timeout);
GLib.unlink(temporaryPath);

assertEqual(streamedEvent?.code, 0x290, 'streams an input event asynchronously');
assertEqual(streamedEvent?.value, 1, 'streams the key state asynchronously');

print('input-monitor tests passed');
