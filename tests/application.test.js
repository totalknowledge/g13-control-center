#!/usr/bin/env -S gjs -m

import {
    APPLICATION_ID,
    APPLICATION_NAME,
    APPLICATION_VERSION,
    WindowLifecycle,
} from '../src/application.js';

function assertEqual(actual, expected, description) {
    if (actual !== expected)
        throw new Error(`${description}: expected ${expected}, received ${actual}`);
}

assertEqual(
    APPLICATION_ID,
    'io.github.aretedriver.G13ControlCenter',
    'exports the D-Bus application ID',
);
assertEqual(APPLICATION_NAME, 'G13 Control Center', 'exports the application name');
assertEqual(APPLICATION_VERSION, '0.1.3', 'exports the release version');

let invalidFactoryRejected = false;
try {
    new WindowLifecycle(null);
} catch (error) {
    invalidFactoryRejected = error instanceof TypeError;
}
assertEqual(invalidFactoryRejected, true, 'rejects an invalid window factory');

let createCount = 0;
let presentCount = 0;
let hideCount = 0;
let stopCount = 0;
const lifecycle = new WindowLifecycle(() => {
    createCount++;
    return {
        window: {
            present: () => presentCount++,
            set_visible: visible => {
                if (!visible)
                    hideCount++;
            },
        },
        stop: () => stopCount++,
    };
});

assertEqual(lifecycle.window, null, 'starts without a window');
const firstWindow = lifecycle.activate();
const secondWindow = lifecycle.activate();
assertEqual(firstWindow, secondWindow, 'reuses the window on repeated activation');
assertEqual(createCount, 1, 'creates only one window');
assertEqual(presentCount, 2, 'presents the existing window again');
lifecycle.hide();
assertEqual(hideCount, 1, 'hides the window without stopping it');
lifecycle.stop();
lifecycle.stop();
assertEqual(stopCount, 1, 'stops managed resources exactly once');
assertEqual(lifecycle.window, null, 'forgets the stopped window');
lifecycle.hide();

print('application lifecycle tests passed');

