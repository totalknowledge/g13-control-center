import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {thumbDirections} from './input-monitor.js';

const LEGACY_CONFIG_GROUP = 'Keyboard Mappings';
const GENERAL_CONFIG_GROUP = 'General';
const ACTIVE_PROFILE_KEY = 'active-profile';
const THUMBSTICK_MODE_KEY = 'thumbstick-mode';
const GAMEPAD_STICK_KEY = 'gamepad-stick';
const HUD_COLOR_KEY = 'hud-color';
const HUD_BRIGHTNESS_KEY = 'hud-brightness';

export const THUMBSTICK_MODES = ['gamepad', 'wasd', 'arrows'];
export const GAMEPAD_STICKS = ['left', 'right'];
export const DEFAULT_HUD_COLOR = '#5aff6e';
export const DEFAULT_HUD_BRIGHTNESS = 255;

const THUMBSTICK_KEY_CODES = {
    wasd: {up: 17, down: 31, left: 30, right: 32},
    arrows: {up: 103, down: 108, left: 105, right: 106},
};

const GAMEPAD_BUTTON_BY_CONTROL = new Map([
    ['thumb-press', 0],
    ['thumb-side', 1],
    ['thumb-bottom', 2],
]);

export const PROFILES = ['m1', 'm2', 'm3'];

const PROFILE_GROUPS = new Map([
    ['m1', 'Profile M1'],
    ['m2', 'Profile M2'],
    ['m3', 'Profile M3'],
]);

const letters = [
    ['A', 30], ['B', 48], ['C', 46], ['D', 32], ['E', 18], ['F', 33],
    ['G', 34], ['H', 35], ['I', 23], ['J', 36], ['K', 37], ['L', 38],
    ['M', 50], ['N', 49], ['O', 24], ['P', 25], ['Q', 16], ['R', 19],
    ['S', 31], ['T', 20], ['U', 22], ['V', 47], ['W', 17], ['X', 45],
    ['Y', 21], ['Z', 44],
];

const numbers = [
    ['0', 11], ['1', 2], ['2', 3], ['3', 4], ['4', 5],
    ['5', 6], ['6', 7], ['7', 8], ['8', 9], ['9', 10],
];

const functionKeys = [
    ['F1', 59], ['F2', 60], ['F3', 61], ['F4', 62], ['F5', 63],
    ['F6', 64], ['F7', 65], ['F8', 66], ['F9', 67], ['F10', 68],
    ['F11', 87], ['F12', 88],
];

function keyboardEvent(label, code, shortLabel = label) {
    return {label, code, shortLabel};
}

export const KEYBOARD_EVENTS = [
    ...letters.map(([label, code]) => keyboardEvent(label, code)),
    ...numbers.map(([label, code]) => keyboardEvent(label, code)),
    ...functionKeys.map(([label, code]) => keyboardEvent(label, code)),
    keyboardEvent('Escape', 1, 'Esc'),
    keyboardEvent('Tab', 15),
    keyboardEvent('Enter', 28),
    keyboardEvent('Space', 57),
    keyboardEvent('Backspace', 14, 'Bksp'),
    keyboardEvent('Delete', 111, 'Del'),
    keyboardEvent('Insert', 110, 'Ins'),
    keyboardEvent('Home', 102),
    keyboardEvent('End', 107),
    keyboardEvent('Page Up', 104, 'PgUp'),
    keyboardEvent('Page Down', 109, 'PgDn'),
    keyboardEvent('Arrow Up', 103, '↑'),
    keyboardEvent('Arrow Down', 108, '↓'),
    keyboardEvent('Arrow Left', 105, '←'),
    keyboardEvent('Arrow Right', 106, '→'),
    keyboardEvent('Left Shift', 42, 'L Shift'),
    keyboardEvent('Right Shift', 54, 'R Shift'),
    keyboardEvent('Left Ctrl', 29, 'L Ctrl'),
    keyboardEvent('Right Ctrl', 97, 'R Ctrl'),
    keyboardEvent('Left Alt', 56, 'L Alt'),
    keyboardEvent('Right Alt', 100, 'R Alt'),
    keyboardEvent('Left Super', 125, 'L Super'),
    keyboardEvent('Right Super', 126, 'R Super'),
    keyboardEvent('Caps Lock', 58, 'Caps'),
    keyboardEvent('Num Lock', 69, 'Num'),
    keyboardEvent('Scroll Lock', 70, 'Scroll'),
    keyboardEvent('Print Screen', 99, 'PrtSc'),
    keyboardEvent('Pause', 119),
    keyboardEvent('Minus (-)', 12, '-'),
    keyboardEvent('Equals (=)', 13, '='),
    keyboardEvent('Left Bracket ([)', 26, '['),
    keyboardEvent('Right Bracket (])', 27, ']'),
    keyboardEvent('Backslash (\\)', 43, '\\'),
    keyboardEvent('Semicolon (;)', 39, ';'),
    keyboardEvent('Apostrophe (\')', 40, '\''),
    keyboardEvent('Grave (`)', 41, '`'),
    keyboardEvent('Comma (,)', 51, ','),
    keyboardEvent('Period (.)', 52, '.'),
    keyboardEvent('Slash (/)', 53, '/'),
    keyboardEvent('Numpad 0', 82, 'Num 0'),
    keyboardEvent('Numpad 1', 79, 'Num 1'),
    keyboardEvent('Numpad 2', 80, 'Num 2'),
    keyboardEvent('Numpad 3', 81, 'Num 3'),
    keyboardEvent('Numpad 4', 75, 'Num 4'),
    keyboardEvent('Numpad 5', 76, 'Num 5'),
    keyboardEvent('Numpad 6', 77, 'Num 6'),
    keyboardEvent('Numpad 7', 71, 'Num 7'),
    keyboardEvent('Numpad 8', 72, 'Num 8'),
    keyboardEvent('Numpad 9', 73, 'Num 9'),
    keyboardEvent('Numpad Enter', 96, 'Num ↵'),
    keyboardEvent('Numpad Plus', 78, 'Num +'),
    keyboardEvent('Numpad Minus', 74, 'Num −'),
    keyboardEvent('Numpad Multiply', 55, 'Num ×'),
    keyboardEvent('Numpad Divide', 98, 'Num ÷'),
    keyboardEvent('Numpad Decimal', 83, 'Num .'),
];

export const KEYBOARD_EVENT_BY_CODE = new Map(
    KEYBOARD_EVENTS.map(event => [event.code, event]),
);

export const KEYPAD_PROGRAMMABLE_CONTROLS = Array.from(
    {length: 22},
    (_unused, index) => `g${index + 1}`,
);

export const THUMB_PROGRAMMABLE_CONTROLS = [
    'thumb-side',
    'thumb-bottom',
    'thumb-press',
];

export const PROGRAMMABLE_CONTROLS = [
    ...KEYPAD_PROGRAMMABLE_CONTROLS,
    ...THUMB_PROGRAMMABLE_CONTROLS,
];

export function controlTitle(control) {
    if (/^g\d+$/.test(control))
        return control.toUpperCase();

    return {
        'thumb-side': 'Side',
        'thumb-bottom': 'Lower',
        'thumb-press': 'Thumbpad press',
    }[control] ?? control;
}

export function profileTitle(profile) {
    return PROFILES.includes(profile) ? profile.toUpperCase() : profile;
}

export function thumbstickModeTitle(mode) {
    return {
        gamepad: 'Gamepad',
        wasd: 'WASD keys',
        arrows: 'Arrow keys',
    }[mode] ?? mode;
}

export function normalizeThumbAxis(value) {
    const limited = Math.max(0, Math.min(255, value));

    if (limited === 128)
        return 0;

    return limited < 128
        ? Math.round((limited - 128) * 32768 / 128)
        : Math.round((limited - 128) * 32767 / 127);
}

function validHudColor(color) {
    return /^#[0-9a-f]{6}$/i.test(color);
}

function defaultConfigPath() {
    return GLib.build_filenamev([
        GLib.get_user_config_dir(),
        'g13-control-center',
        'key-mappings.ini',
    ]);
}

export class KeyboardMappingStore {
    constructor(path = defaultConfigPath(), detectedProfile = null) {
        this.path = path;
        this.activeProfile = 'm1';
        this.thumbstickMode = 'gamepad';
        this.gamepadStick = 'left';
        this.hudColor = DEFAULT_HUD_COLOR;
        this.hudBrightness = DEFAULT_HUD_BRIGHTNESS;
        this._mappings = new Map(
            PROFILES.map(profile => [profile, new Map()]),
        );
        this._load(detectedProfile);
    }

    get(control, profile = this.activeProfile) {
        return this._profileMappings(profile).get(control) ?? null;
    }

    set(control, code, profile = this.activeProfile) {
        if (!PROGRAMMABLE_CONTROLS.includes(control))
            throw new Error(`Control ${control} is not programmable`);

        if (code !== null && !KEYBOARD_EVENT_BY_CODE.has(code))
            throw new Error(`Keyboard code ${code} is not supported`);

        const mappings = this._profileMappings(profile);
        const previous = this.get(control, profile);

        try {
            if (code === null)
                mappings.delete(control);
            else
                mappings.set(control, code);

            this._save();
        } catch (error) {
            if (previous === null)
                mappings.delete(control);
            else
                mappings.set(control, previous);

            throw error;
        }
    }

    setActiveProfile(profile) {
        if (!PROFILES.includes(profile))
            throw new Error(`Profile ${profile} is not supported`);

        if (profile === this.activeProfile)
            return;

        const previous = this.activeProfile;
        this.activeProfile = profile;

        try {
            this._save();
        } catch (error) {
            this.activeProfile = previous;
            throw error;
        }
    }

    setThumbstickMode(mode) {
        if (!THUMBSTICK_MODES.includes(mode))
            throw new Error(`Thumbstick mode ${mode} is not supported`);

        if (mode === this.thumbstickMode)
            return;

        const previous = this.thumbstickMode;
        this.thumbstickMode = mode;

        try {
            this._save();
        } catch (error) {
            this.thumbstickMode = previous;
            throw error;
        }
    }

    setGamepadStick(stick) {
        if (!GAMEPAD_STICKS.includes(stick))
            throw new Error(`Gamepad stick ${stick} is not supported`);

        if (stick === this.gamepadStick)
            return;

        const previous = this.gamepadStick;
        this.gamepadStick = stick;

        try {
            this._save();
        } catch (error) {
            this.gamepadStick = previous;
            throw error;
        }
    }

    setLighting(color, brightness) {
        const normalizedColor = color.toLowerCase();
        const normalizedBrightness = Math.round(brightness);

        if (!validHudColor(normalizedColor))
            throw new Error(`HUD color ${color} is not valid`);

        if (normalizedBrightness < 1 || normalizedBrightness > 255)
            throw new Error('HUD brightness must be between 1 and 255');

        if (
            normalizedColor === this.hudColor &&
            normalizedBrightness === this.hudBrightness
        ) {
            return;
        }

        const previousColor = this.hudColor;
        const previousBrightness = this.hudBrightness;
        this.hudColor = normalizedColor;
        this.hudBrightness = normalizedBrightness;

        try {
            this._save();
        } catch (error) {
            this.hudColor = previousColor;
            this.hudBrightness = previousBrightness;
            throw error;
        }
    }

    _profileMappings(profile) {
        const mappings = this._mappings.get(profile);

        if (!mappings)
            throw new Error(`Profile ${profile} is not supported`);

        return mappings;
    }

    _load(detectedProfile) {
        const keyFile = new GLib.KeyFile();

        try {
            keyFile.load_from_file(this.path, GLib.KeyFileFlags.NONE);
        } catch {
            if (PROFILES.includes(detectedProfile))
                this.activeProfile = detectedProfile;

            return;
        }

        try {
            const savedProfile = keyFile.get_string(
                GENERAL_CONFIG_GROUP,
                ACTIVE_PROFILE_KEY,
            );

            if (PROFILES.includes(savedProfile))
                this.activeProfile = savedProfile;
        } catch {
            // M1 remains the default for an older or incomplete config.
        }

        try {
            const savedMode = keyFile.get_string(
                GENERAL_CONFIG_GROUP,
                THUMBSTICK_MODE_KEY,
            );

            if (THUMBSTICK_MODES.includes(savedMode))
                this.thumbstickMode = savedMode;
        } catch {
            // Gamepad remains the default for an older config.
        }

        try {
            const savedStick = keyFile.get_string(
                GENERAL_CONFIG_GROUP,
                GAMEPAD_STICK_KEY,
            );

            if (GAMEPAD_STICKS.includes(savedStick))
                this.gamepadStick = savedStick;
        } catch {
            // The left analog stick remains the default.
        }

        try {
            const savedColor = keyFile.get_string(
                GENERAL_CONFIG_GROUP,
                HUD_COLOR_KEY,
            );

            if (validHudColor(savedColor))
                this.hudColor = savedColor.toLowerCase();
        } catch {
            // The Logitech green default remains selected.
        }

        try {
            const savedBrightness = keyFile.get_integer(
                GENERAL_CONFIG_GROUP,
                HUD_BRIGHTNESS_KEY,
            );

            if (savedBrightness >= 1 && savedBrightness <= 255)
                this.hudBrightness = savedBrightness;
        } catch {
            // Full brightness remains the default.
        }

        for (const profile of PROFILES) {
            const mappings = this._profileMappings(profile);
            const group = PROFILE_GROUPS.get(profile);

            for (const control of PROGRAMMABLE_CONTROLS) {
                try {
                    const code = keyFile.get_integer(group, control);

                    if (KEYBOARD_EVENT_BY_CODE.has(code))
                        mappings.set(control, code);
                } catch {
                    // Missing and invalid entries remain unassigned.
                }
            }
        }

        const m1Mappings = this._profileMappings('m1');

        for (const control of PROGRAMMABLE_CONTROLS) {
            if (m1Mappings.has(control))
                continue;

            try {
                const code = keyFile.get_integer(LEGACY_CONFIG_GROUP, control);

                if (KEYBOARD_EVENT_BY_CODE.has(code))
                    m1Mappings.set(control, code);
            } catch {
                // Legacy mappings are optional and migrate into M1.
            }
        }

        if (PROFILES.includes(detectedProfile))
            this.activeProfile = detectedProfile;
    }

    _save() {
        const directory = GLib.path_get_dirname(this.path);

        if (GLib.mkdir_with_parents(directory, 0o700) < 0)
            throw new Error(`Unable to create ${directory}`);

        const keyFile = new GLib.KeyFile();

        keyFile.set_string(
            GENERAL_CONFIG_GROUP,
            ACTIVE_PROFILE_KEY,
            this.activeProfile,
        );
        keyFile.set_string(
            GENERAL_CONFIG_GROUP,
            THUMBSTICK_MODE_KEY,
            this.thumbstickMode,
        );
        keyFile.set_string(
            GENERAL_CONFIG_GROUP,
            GAMEPAD_STICK_KEY,
            this.gamepadStick,
        );
        keyFile.set_string(
            GENERAL_CONFIG_GROUP,
            HUD_COLOR_KEY,
            this.hudColor,
        );
        keyFile.set_integer(
            GENERAL_CONFIG_GROUP,
            HUD_BRIGHTNESS_KEY,
            this.hudBrightness,
        );

        for (const profile of PROFILES) {
            const group = PROFILE_GROUPS.get(profile);

            for (const [control, code] of this._profileMappings(profile))
                keyFile.set_integer(group, control, code);
        }

        const [contents] = keyFile.to_data();

        if (!GLib.file_set_contents(this.path, contents))
            throw new Error(`Unable to save ${this.path}`);
    }
}

export class KeyboardMappingRuntime {
    constructor(store, emitKey) {
        this._store = store;
        this._emitKey = emitKey;
        this._pressed = new Map();
    }

    update(control, pressed) {
        if (!PROGRAMMABLE_CONTROLS.includes(control))
            return;

        const previous = this._pressed.get(control) ?? false;

        if (previous === pressed)
            return;

        this._pressed.set(control, pressed);
        const code = this._store.get(control);

        if (code !== null)
            this._emitKey(code, pressed);
    }

    release(controls = PROGRAMMABLE_CONTROLS) {
        for (const control of controls)
            this.update(control, false);
    }

    reset(controls = PROGRAMMABLE_CONTROLS) {
        for (const control of controls)
            this._pressed.delete(control);
    }
}

export class ThumbstickOutputRuntime {
    constructor(
        {emitKey, emitAxis, emitButton},
        mode = 'gamepad',
        gamepadStick = 'left',
    ) {
        this._emitKey = emitKey;
        this._emitAxis = emitAxis;
        this._emitButton = emitButton;
        this._mode = THUMBSTICK_MODES.includes(mode) ? mode : 'gamepad';
        this._gamepadStick = GAMEPAD_STICKS.includes(gamepadStick)
            ? gamepadStick
            : 'left';
        this._axes = {x: 0, y: 0};
        this._directions = {
            up: false,
            down: false,
            left: false,
            right: false,
        };
        this._buttons = new Map(
            [...GAMEPAD_BUTTON_BY_CONTROL.keys()].map(control => [control, false]),
        );
    }

    get mode() {
        return this._mode;
    }

    get gamepadStick() {
        return this._gamepadStick;
    }

    setMode(mode) {
        if (!THUMBSTICK_MODES.includes(mode))
            throw new Error(`Thumbstick mode ${mode} is not supported`);

        if (mode === this._mode)
            return;

        this.release();
        this._mode = mode;
        this.reset();
    }

    setGamepadStick(stick) {
        if (!GAMEPAD_STICKS.includes(stick))
            throw new Error(`Gamepad stick ${stick} is not supported`);

        if (stick === this._gamepadStick)
            return;

        this._gamepadStick = stick;

        if (this._mode === 'gamepad')
            this._emitAxis(stick, this._axes.x, this._axes.y);
    }

    updateAxes(x, y) {
        if (this._mode === 'gamepad') {
            this._axes.x = normalizeThumbAxis(x);
            this._axes.y = normalizeThumbAxis(y);
            this._emitAxis(
                this._gamepadStick,
                this._axes.x,
                this._axes.y,
            );
            return;
        }

        const next = thumbDirections(x, y);
        const keyCodes = THUMBSTICK_KEY_CODES[this._mode];

        for (const direction of Object.keys(this._directions)) {
            if (this._directions[direction] === next[direction])
                continue;

            this._directions[direction] = next[direction];
            this._emitKey(keyCodes[direction], next[direction]);
        }
    }

    updateButton(control, pressed) {
        const index = GAMEPAD_BUTTON_BY_CONTROL.get(control);

        if (index === undefined || this._mode !== 'gamepad')
            return false;

        const previous = this._buttons.get(control);

        if (previous !== pressed) {
            this._buttons.set(control, pressed);
            this._emitButton(index, pressed);
        }

        return true;
    }

    release() {
        if (this._mode === 'gamepad') {
            this._emitAxis(this._gamepadStick, 0, 0);

            for (const [control, pressed] of this._buttons) {
                if (pressed) {
                    this._emitButton(GAMEPAD_BUTTON_BY_CONTROL.get(control), false);
                    this._buttons.set(control, false);
                }
            }
        } else {
            const keyCodes = THUMBSTICK_KEY_CODES[this._mode];

            for (const [direction, pressed] of Object.entries(this._directions)) {
                if (pressed) {
                    this._emitKey(keyCodes[direction], false);
                    this._directions[direction] = false;
                }
            }
        }
    }

    reset() {
        this._axes.x = 0;
        this._axes.y = 0;

        for (const direction of Object.keys(this._directions))
            this._directions[direction] = false;

        for (const control of this._buttons.keys())
            this._buttons.set(control, false);
    }
}

function projectRoot() {
    const [modulePath] = GLib.filename_from_uri(import.meta.url);
    return GLib.path_get_dirname(GLib.path_get_dirname(modulePath));
}

function defaultHelperPath() {
    const root = projectRoot();
    const candidates = [
        GLib.build_filenamev([root, 'build', 'release', 'g13-keyboard-helper']),
        GLib.build_filenamev([root, 'build', 'debug', 'g13-keyboard-helper']),
        '/usr/libexec/g13-control-center-helper',
    ];

    return candidates.find(path =>
        GLib.file_test(path, GLib.FileTest.IS_EXECUTABLE)
    ) ?? null;
}

export class KeyboardEmitter {
    constructor(onStatus, helperPath = defaultHelperPath()) {
        this.available = false;
        this.gamepadAvailable = false;
        this.error = null;
        this._onStatus = onStatus;
        this._process = null;
        this._stdin = null;
        this._stopping = false;
        this._helperPath = helperPath;
        this._restartSource = null;

        if (!helperPath) {
            this._setStatus(false, 'Build the keyboard helper with cargo build --release.');
            return;
        }

        this._start();
    }

    emitKey(code, pressed) {
        if (!this.available || !this._stdin)
            return false;

        try {
            this._stdin.put_string(`${code} ${pressed ? 1 : 0}\n`, null);
            return true;
        } catch (error) {
            this._setStatus(false, error.message);

            try {
                this._process?.force_exit();
            } catch {
                // Process completion schedules the retry when possible.
            }

            return false;
        }
    }

    emitGamepadAxes(stick, x, y) {
        return this._writeCommand(`axis ${stick} ${x} ${y}`);
    }

    emitGamepadButton(index, pressed) {
        return this._writeCommand(`button ${index} ${pressed ? 1 : 0}`);
    }

    setLighting(path, red, green, blue, brightness) {
        return this._writeCommand(
            `light ${path} ${red} ${green} ${blue} ${brightness}`,
        );
    }

    grabPhysicalThumbstick(path) {
        return this._writeCommand(path ? `grab ${path}` : 'ungrab');
    }

    _writeCommand(command) {
        if (!this.available || !this._stdin)
            return false;

        try {
            this._stdin.put_string(`${command}\n`, null);
            return true;
        } catch (error) {
            this._setStatus(false, error.message);

            try {
                this._process?.force_exit();
            } catch {
                // Process completion schedules the retry when possible.
            }

            return false;
        }
    }

    stop() {
        this._stopping = true;

        if (this._restartSource !== null) {
            GLib.source_remove(this._restartSource);
            this._restartSource = null;
        }

        try {
            this._stdin?.put_string('quit\n', null);
            this._stdin?.close(null);
        } catch {
            this._process?.force_exit();
        }

        this._stdin = null;
        this.available = false;
        this.gamepadAvailable = false;
    }

    _start() {
        try {
            const process = Gio.Subprocess.new(
                [this._helperPath],
                Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE,
            );
            this._process = process;
            this._stdin = new Gio.DataOutputStream({
                base_stream: process.get_stdin_pipe(),
            });
            const stdout = new Gio.DataInputStream({
                base_stream: process.get_stdout_pipe(),
            });

            stdout.read_line_async(
                GLib.PRIORITY_DEFAULT,
                null,
                (stream, result) => {
                    try {
                        const [line] = stream.read_line_finish_utf8(result);

                        if (
                            this._process === process &&
                            (line === 'READY' || line?.startsWith('READY '))
                        ) {
                            const gamepadAvailable = line === 'READY GAMEPAD';
                            const warning = line.startsWith('READY KEYBOARD_ONLY ')
                                ? line.slice('READY KEYBOARD_ONLY '.length)
                                : (line === 'READY'
                                    ? 'The installed 0.1.0 helper has no gamepad support; upgrade the package.'
                                    : null);
                            this._setStatus(true, warning, gamepadAvailable);
                        }
                    } catch {
                        // Process completion below reports the useful error.
                    }
                },
            );

            process.wait_async(null, (completedProcess, result) => {
                try {
                    completedProcess.wait_finish(result);
                } catch {
                    // get_successful() below still reflects the exit status.
                }

                if (this._stopping)
                    return;

                if (this._process === completedProcess) {
                    this._process = null;
                    this._stdin = null;
                }

                const bytes = completedProcess.get_stderr_pipe()
                    .read_bytes(4096, null)
                    .get_data();
                const error = new TextDecoder().decode(bytes).trim();
                this._setStatus(
                    false,
                    error || 'The keyboard helper stopped unexpectedly.',
                );
                this._scheduleRestart();
            });
        } catch (error) {
            this._setStatus(false, error.message);
            this._scheduleRestart();
        }
    }

    _scheduleRestart() {
        if (this._stopping || this._restartSource !== null)
            return;

        this._restartSource = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            5,
            () => {
                this._restartSource = null;
                this._start();
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _setStatus(available, error, gamepadAvailable = false) {
        this.available = available;
        this.error = error;
        this.gamepadAvailable = available && gamepadAvailable;
        this._onStatus(available, error, this.gamepadAvailable);
    }
}
