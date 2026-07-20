#!/usr/bin/env -S gjs -m

import GLib from 'gi://GLib';

import {
    controlTitle,
    KeyboardEmitter,
    KEYBOARD_EVENT_BY_CODE,
    KeyboardMappingRuntime,
    KeyboardMappingStore,
    normalizeThumbAxis,
    PROGRAMMABLE_CONTROLS,
    profileTitle,
    ThumbstickOutputRuntime,
    thumbstickModeTitle,
} from '../src/key-mappings.js';

function assertEqual(actual, expected, description) {
    if (actual !== expected)
        throw new Error(`${description}: expected ${expected}, received ${actual}`);
}

function assertThrows(callback, description) {
    let threw = false;
    try {
        callback();
    } catch {
        threw = true;
    }
    assertEqual(threw, true, description);
}

const [temporaryFd, temporaryPath] = GLib.file_open_tmp(
    'g13-key-mappings-test-XXXXXX',
);
GLib.close(temporaryFd);
GLib.unlink(temporaryPath);

const store = new KeyboardMappingStore(temporaryPath);
assertEqual(store.activeProfile, 'm1', 'starts on the M1 profile');
assertEqual(store.thumbstickMode, 'gamepad', 'starts in gamepad mode');
assertEqual(store.gamepadStick, 'left', 'starts on the left gamepad stick');
assertEqual(store.hudColor, '#5aff6e', 'uses the Logitech green HUD color');
assertEqual(store.hudBrightness, 255, 'starts at full HUD brightness');
assertEqual(store.get('g1'), null, 'starts with an unassigned control');
store.set('g1', 30);
store.set('thumb-press', 57);
assertEqual(store.get('g1'), 30, 'stores a G-key assignment');
assertEqual(store.get('thumb-press'), 57, 'stores a thumb assignment');

store.setActiveProfile('m2');
assertEqual(store.get('g1'), null, 'keeps M2 independent from M1');
store.set('g1', 48);
store.setThumbstickMode('arrows');
store.setGamepadStick('right');
store.setLighting('#336699', 192);
assertEqual(store.get('g1'), 48, 'stores an M2 assignment');
assertEqual(store.get('g1', 'm1'), 30, 'retains the M1 assignment');

const reloaded = new KeyboardMappingStore(temporaryPath);
assertEqual(reloaded.activeProfile, 'm2', 'reloads the selected profile');
assertEqual(reloaded.get('g1'), 48, 'reloads the active M2 assignment');
assertEqual(reloaded.get('g1', 'm1'), 30, 'reloads the M1 assignment');
assertEqual(reloaded.thumbstickMode, 'arrows', 'reloads thumbstick output mode');
assertEqual(reloaded.gamepadStick, 'right', 'reloads the selected gamepad stick');
assertEqual(reloaded.hudColor, '#336699', 'reloads the HUD color');
assertEqual(reloaded.hudBrightness, 192, 'reloads HUD brightness');
assertEqual(
    reloaded.get('thumb-press', 'm1'),
    57,
    'reloads a persisted thumb assignment',
);

const hardwareSelected = new KeyboardMappingStore(temporaryPath, 'm3');
assertEqual(
    hardwareSelected.activeProfile,
    'm3',
    'prefers the active hardware profile at startup',
);
assertEqual(
    hardwareSelected.get('g1'),
    null,
    'uses the independent mapping table for the hardware profile',
);

const emitted = [];
const runtime = new KeyboardMappingRuntime(
    reloaded,
    (code, pressed) => emitted.push([code, pressed]),
);
runtime.update('g1', true);
runtime.update('g1', true);
runtime.update('g1', false);
reloaded.setActiveProfile('m1');
runtime.update('thumb-press', true);
runtime.release();

assertEqual(emitted.length, 4, 'emits only control-state transitions');
assertEqual(emitted[0].join(':'), '48:true', 'emits the active profile key press');
assertEqual(emitted[1].join(':'), '48:false', 'emits the active profile key release');
assertEqual(emitted[2].join(':'), '57:true', 'emits a mapped thumb press');
assertEqual(emitted[3].join(':'), '57:false', 'releases held mappings');

const resetEmitted = [];
const resetRuntime = new KeyboardMappingRuntime(
    reloaded,
    (code, pressed) => resetEmitted.push([code, pressed]),
);
resetRuntime.update('g1', true);
resetRuntime.reset();
resetRuntime.update('g1', false);
assertEqual(
    resetEmitted.length,
    1,
    'forgets key state when the virtual keyboard is recreated',
);
assertEqual(KEYBOARD_EVENT_BY_CODE.get(30).label, 'A', 'defines keyboard A');
assertEqual(controlTitle('g22'), 'G22', 'formats a G-key title');
assertEqual(controlTitle('thumb-side'), 'Side', 'formats the side button title');
assertEqual(controlTitle('thumb-bottom'), 'Lower', 'formats the lower button title');
assertEqual(controlTitle('thumb-press'), 'Thumbpad press', 'formats the thumbpad title');
assertEqual(controlTitle('custom'), 'custom', 'preserves an unknown control title');
assertEqual(profileTitle('m2'), 'M2', 'formats a profile title');
assertEqual(profileTitle('custom'), 'custom', 'preserves an unknown profile title');
assertEqual(thumbstickModeTitle('wasd'), 'WASD keys', 'formats WASD mode');
assertEqual(thumbstickModeTitle('arrows'), 'Arrow keys', 'formats arrow mode');
assertEqual(thumbstickModeTitle('custom'), 'custom', 'preserves an unknown mode title');
assertEqual(
    PROGRAMMABLE_CONTROLS.length,
    25,
    'exposes 22 G-keys and three thumb controls',
);

assertEqual(normalizeThumbAxis(0), -32768, 'normalizes the negative axis limit');
assertEqual(normalizeThumbAxis(128), 0, 'normalizes the axis center');
assertEqual(normalizeThumbAxis(255), 32767, 'normalizes the positive axis limit');
assertEqual(normalizeThumbAxis(-10), -32768, 'clamps below the axis range');
assertEqual(normalizeThumbAxis(300), 32767, 'clamps above the axis range');

const gamepadEvents = [];
const thumbRuntime = new ThumbstickOutputRuntime({
    emitKey: (code, pressed) => gamepadEvents.push(['key', code, pressed]),
    emitAxis: (stick, x, y) => gamepadEvents.push(['axis', stick, x, y]),
    emitButton: (index, pressed) =>
        gamepadEvents.push(['button', index, pressed]),
});
thumbRuntime.updateAxes(0, 255);
thumbRuntime.updateButton('thumb-press', true);
thumbRuntime.updateButton('thumb-press', true);
assertEqual(
    gamepadEvents[0].join(':'),
    'axis:left:-32768:32767',
    'emits normalized analog gamepad axes',
);
assertEqual(
    gamepadEvents[1].join(':'),
    'button:0:true',
    'maps thumbpad press to a gamepad button',
);
assertEqual(gamepadEvents.length, 2, 'deduplicates gamepad button state');

thumbRuntime.setGamepadStick('right');
assertEqual(
    gamepadEvents[2].join(':'),
    'axis:right:-32768:32767',
    'moves current analog state to the right stick',
);

thumbRuntime.setMode('wasd');
thumbRuntime.updateAxes(20, 30);
thumbRuntime.updateAxes(128, 128);
assertEqual(
    gamepadEvents[3].join(':'),
    'axis:right:0:0',
    'centers the virtual gamepad when changing modes',
);
assertEqual(gamepadEvents[4].join(':'), 'button:0:false', 'releases gamepad buttons');
assertEqual(gamepadEvents[5].join(':'), 'key:17:true', 'maps up to W');
assertEqual(gamepadEvents[6].join(':'), 'key:30:true', 'maps left to A');
assertEqual(gamepadEvents[7].join(':'), 'key:17:false', 'releases W at center');
assertEqual(gamepadEvents[8].join(':'), 'key:30:false', 'releases A at center');

assertThrows(() => thumbRuntime.setMode('invalid'), 'rejects an invalid runtime mode');
assertThrows(() => thumbRuntime.setGamepadStick('middle'), 'rejects an invalid gamepad stick');
assertEqual(thumbRuntime.updateButton('g1', true), false, 'ignores non-thumb buttons');
assertEqual(thumbRuntime.updateButton('thumb-side', true), false, 'ignores buttons in key mode');
thumbRuntime.setMode('arrows');
thumbRuntime.updateAxes(240, 240);
thumbRuntime.release();
thumbRuntime.reset();

assertThrows(() => store.set('m1', 30), 'rejects a non-programmable control');
assertThrows(() => store.set('g1', 9999), 'rejects an unsupported keyboard code');
assertThrows(() => store.get('g1', 'm4'), 'rejects an unsupported mapping profile');
assertThrows(() => store.setActiveProfile('m4'), 'rejects an unsupported active profile');
assertThrows(() => store.setThumbstickMode('mouse'), 'rejects an unsupported store mode');
assertThrows(() => store.setGamepadStick('middle'), 'rejects an unsupported store stick');
assertThrows(() => store.setLighting('green', 100), 'rejects an invalid HUD color');
assertThrows(() => store.setLighting('#00ff00', 0), 'rejects a low HUD brightness');
assertThrows(() => store.setLighting('#00ff00', 256), 'rejects a high HUD brightness');
store.setActiveProfile(store.activeProfile);
store.setThumbstickMode(store.thumbstickMode);
store.setGamepadStick(store.gamepadStick);
store.setLighting(store.hudColor, store.hudBrightness);

const brokenStore = new KeyboardMappingStore(`${temporaryPath}/config`);
assertThrows(() => brokenStore.set('g1', 30), 'rolls back a failed mapping save');
assertEqual(brokenStore.get('g1'), null, 'restores a mapping after save failure');
assertThrows(() => brokenStore.setActiveProfile('m2'), 'rolls back a failed profile save');
assertEqual(brokenStore.activeProfile, 'm1', 'restores the profile after save failure');
assertThrows(() => brokenStore.setThumbstickMode('wasd'), 'rolls back a failed mode save');
assertEqual(brokenStore.thumbstickMode, 'gamepad', 'restores the mode after save failure');
assertThrows(() => brokenStore.setGamepadStick('right'), 'rolls back a failed stick save');
assertEqual(brokenStore.gamepadStick, 'left', 'restores the stick after save failure');
assertThrows(
    () => brokenStore.setLighting('#112233', 100),
    'rolls back a failed lighting save',
);
assertEqual(brokenStore.hudColor, '#5aff6e', 'restores lighting after save failure');

const emitterStatuses = [];
const unavailableEmitter = new KeyboardEmitter(
    (...status) => emitterStatuses.push(status),
    null,
);
assertEqual(unavailableEmitter.available, false, 'reports a missing helper');
assertEqual(unavailableEmitter.emitKey(30, true), false, 'does not emit without a helper');
assertEqual(unavailableEmitter.emitGamepadAxes('left', 0, 0), false, 'does not emit axes');
assertEqual(unavailableEmitter.emitGamepadButton(0, true), false, 'does not emit buttons');
assertEqual(unavailableEmitter.setLighting('/dev/null', 1, 2, 3, 4), false, 'does not light');
assertEqual(unavailableEmitter.grabPhysicalThumbstick(null), false, 'does not grab');
unavailableEmitter.stop();
assertEqual(emitterStatuses.length, 1, 'notifies when the helper is missing');

const commands = [];
const fakeEmitter = Object.create(KeyboardEmitter.prototype);
Object.assign(fakeEmitter, {
    available: true,
    gamepadAvailable: true,
    error: null,
    _stdin: {
        put_string: command => commands.push(command),
        close: () => commands.push('closed'),
    },
    _process: null,
    _stopping: false,
    _restartSource: null,
    _onStatus: () => {},
});
assertEqual(fakeEmitter.emitKey(30, true), true, 'writes keyboard commands');
assertEqual(fakeEmitter.emitGamepadAxes('right', 10, 20), true, 'writes axis commands');
assertEqual(fakeEmitter.emitGamepadButton(2, false), true, 'writes button commands');
assertEqual(fakeEmitter.setLighting('/dev/hidraw0', 1, 2, 3, 4), true, 'writes light commands');
assertEqual(fakeEmitter.grabPhysicalThumbstick('/dev/input/event1'), true, 'writes grab commands');
assertEqual(fakeEmitter.grabPhysicalThumbstick(null), true, 'writes ungrab commands');
fakeEmitter.stop();
assertEqual(commands.includes('quit\n'), true, 'asks the helper to quit cleanly');

let forcedExitCount = 0;
const failingEmitter = Object.create(KeyboardEmitter.prototype);
Object.assign(failingEmitter, {
    available: true,
    gamepadAvailable: true,
    _stdin: {put_string: () => { throw new Error('write failed'); }},
    _process: {force_exit: () => forcedExitCount++},
    _onStatus: () => {},
});
assertEqual(failingEmitter.emitKey(30, true), false, 'handles failed key writes');
failingEmitter.available = true;
assertEqual(failingEmitter.emitGamepadButton(0, true), false, 'handles failed commands');
assertEqual(forcedExitCount, 2, 'stops the helper after write failures');

store.set('g1', null, 'm1');
assertEqual(store.get('g1', 'm1'), null, 'clears an M1 assignment');
assertEqual(store.get('g1', 'm2'), 48, 'does not clear the M2 assignment');
GLib.unlink(temporaryPath);

print('key-mappings tests passed');
