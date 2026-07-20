import GLib from 'gi://GLib';

export const G13_VENDOR_ID = '046d';
export const G13_PRODUCT_ID = 'c21c';

const INPUT_DEVICES_PATH = '/proc/bus/input/devices';
const INPUT_DEVICE_ROOT = '/dev/input';
const HIDRAW_SYSFS_ROOT = '/sys/class/hidraw';
const LED_SYSFS_ROOT = '/sys/class/leds';
const DEVICE_ROOT = '/dev';

const G13_PROFILE_LED_PATTERN = /^g13:[^:]+:macro_preset_([123])$/;

export function parseInputDevices(contents) {
    return contents
        .split(/\n\s*\n/)
        .map(block => {
            const identity = block.match(
                /^I:\s+Bus=[0-9a-f]+\s+Vendor=([0-9a-f]+)\s+Product=([0-9a-f]+)/im,
            );
            const name = block.match(/^N:\s+Name="([^"]+)"/m);
            const handlers = block.match(/^H:\s+Handlers=(.+)$/m);

            if (!identity || !name)
                return null;

            return {
                vendorId: identity[1].toLowerCase().padStart(4, '0'),
                productId: identity[2].toLowerCase().padStart(4, '0'),
                name: name[1],
                handlers: handlers
                    ? handlers[1].trim().split(/\s+/)
                    : [],
            };
        })
        .filter(device => device !== null);
}

function findG13Devices(contents) {
    return parseInputDevices(contents).filter(device =>
        device.vendorId === G13_VENDOR_ID &&
        device.productId === G13_PRODUCT_ID
    );
}

export function detectG13Components(contents) {
    const g13Devices = findG13Devices(contents);

    return {
        keypad: g13Devices.some(device =>
            device.name.toLowerCase().includes('g13 gaming keypad')
        ),
        thumbstick: g13Devices.some(device =>
            device.name.toLowerCase().includes('g13 thumbstick')
        ),
    };
}

export function findG13EventDevices(contents, root = INPUT_DEVICE_ROOT) {
    const g13Devices = findG13Devices(contents);

    const eventPathFor = nameFragment => {
        const device = g13Devices.find(candidate =>
            candidate.name.toLowerCase().includes(nameFragment)
        );
        const eventHandler = device?.handlers.find(handler =>
            /^event\d+$/.test(handler)
        );

        return eventHandler ? `${root}/${eventHandler}` : null;
    };

    return {
        keypad: eventPathFor('g13 gaming keypad'),
        thumbstick: eventPathFor('g13 thumbstick'),
    };
}

export function isG13HidDevice(uevent) {
    return /^HID_ID=0003:0000046D:0000C21C$/im.test(uevent);
}

export function findG13HidrawDevice(
    sysfsRoot = HIDRAW_SYSFS_ROOT,
    deviceRoot = DEVICE_ROOT,
) {
    let directory = null;

    try {
        directory = GLib.Dir.open(sysfsRoot, 0);
        let entry = directory.read_name();

        while (entry !== null) {
            if (/^hidraw\d+$/.test(entry)) {
                const [success, contents] = GLib.file_get_contents(
                    `${sysfsRoot}/${entry}/device/uevent`,
                );

                if (
                    success &&
                    isG13HidDevice(new TextDecoder().decode(contents))
                ) {
                    return `${deviceRoot}/${entry}`;
                }
            }

            entry = directory.read_name();
        }
    } catch {
        return null;
    } finally {
        directory?.close();
    }

    return null;
}

export function activeProfileFromLedStates(states) {
    const activeProfiles = new Set();

    for (const {name, brightness} of states) {
        const match = name.match(G13_PROFILE_LED_PATTERN);

        if (match && Number(brightness) > 0)
            activeProfiles.add(`m${match[1]}`);
    }

    return activeProfiles.size === 1
        ? [...activeProfiles][0]
        : null;
}

export function detectG13ActiveProfile(sysfsRoot = LED_SYSFS_ROOT) {
    let directory = null;
    const states = [];

    try {
        directory = GLib.Dir.open(sysfsRoot, 0);
        let entry = directory.read_name();

        while (entry !== null) {
            if (G13_PROFILE_LED_PATTERN.test(entry)) {
                const [success, contents] = GLib.file_get_contents(
                    `${sysfsRoot}/${entry}/brightness`,
                );

                if (success) {
                    states.push({
                        name: entry,
                        brightness: new TextDecoder().decode(contents).trim(),
                    });
                }
            }

            entry = directory.read_name();
        }
    } catch {
        return null;
    } finally {
        directory?.close();
    }

    return activeProfileFromLedStates(states);
}

export function scanForG13(path = INPUT_DEVICES_PATH) {
    try {
        const [success, contents] = GLib.file_get_contents(path);

        if (!success)
            throw new Error(`Could not read ${path}`);

        const decoded = new TextDecoder().decode(contents);

        return {
            ...detectG13Components(decoded),
            eventDevices: findG13EventDevices(decoded),
            hidrawDevice: findG13HidrawDevice(),
            available: true,
        };
    } catch {
        return {
            keypad: false,
            thumbstick: false,
            eventDevices: {
                keypad: null,
                thumbstick: null,
            },
            hidrawDevice: null,
            available: false,
        };
    }
}
