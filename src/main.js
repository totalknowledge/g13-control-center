#!/usr/bin/env -S gjs -m

import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import {
    detectG13ActiveProfile,
    scanForG13,
} from './device-detector.js';
import {G13DeviceView, G13_LAYOUT_CSS} from './device-layout.js';
import {
    ABS_X,
    ABS_Y,
    EVENT_TYPE_ABSOLUTE,
    EVENT_TYPE_KEY,
    G13InputMonitor,
    G13_KEY_CONTROLS,
} from './input-monitor.js';
import {
    controlTitle,
    KeyboardEmitter,
    KEYBOARD_EVENT_BY_CODE,
    KEYBOARD_EVENTS,
    KeyboardMappingRuntime,
    KeyboardMappingStore,
    KEYPAD_PROGRAMMABLE_CONTROLS,
    profileTitle,
    PROFILES,
    PROGRAMMABLE_CONTROLS,
    ThumbstickOutputRuntime,
    THUMB_PROGRAMMABLE_CONTROLS,
    thumbstickModeTitle,
} from './key-mappings.js';
import {
    APPLICATION_ID,
    APPLICATION_NAME,
    APPLICATION_VERSION,
    WindowLifecycle,
} from './application.js';
import {StatusNotifier} from './status-notifier.js';

let stylesLoaded = false;

const application = new Adw.Application({
    application_id: APPLICATION_ID,
    flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
});

function createMainWindow(app) {
    if (!stylesLoaded) {
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_string(G13_LAYOUT_CSS);
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
        );
        stylesLoaded = true;
    }

    const windowTitle = new Adw.WindowTitle({
        title: 'G13 Control Center',
        subtitle: 'Logitech G13',
    });

    const header = new Adw.HeaderBar({
        title_widget: windowTitle,
    });

    const icon = new Gtk.Image({
        icon_name: 'input-gaming-symbolic',
        pixel_size: 64,
    });

    const heading = new Gtk.Label({
        label: APPLICATION_NAME,
        halign: Gtk.Align.CENTER,
    });
    heading.add_css_class('title-1');

    const version = new Gtk.Label({
        label: `Version ${APPLICATION_VERSION}`,
        halign: Gtk.Align.CENTER,
    });
    version.add_css_class('dim-label');

    const message = new Gtk.Label({
        halign: Gtk.Align.CENTER,
        justify: Gtk.Justification.CENTER,
        wrap: true,
    });
    message.add_css_class('dim-label');

    const keypadStatus = new Gtk.Image();
    const keypadRow = new Adw.ActionRow({
        title: 'Keypad',
    });
    keypadRow.add_prefix(new Gtk.Image({
        icon_name: 'input-keyboard-symbolic',
    }));
    keypadRow.add_suffix(keypadStatus);

    const thumbstickStatus = new Gtk.Image();
    const thumbstickRow = new Adw.ActionRow({
        title: 'Thumbstick',
    });
    thumbstickRow.add_prefix(new Gtk.Image({
        icon_name: 'input-gaming-symbolic',
    }));
    thumbstickRow.add_suffix(thumbstickStatus);

    const deviceStatus = new Adw.PreferencesGroup({
        title: 'Device status',
        description: 'Logitech G13 input components',
    });
    deviceStatus.add(keypadRow);
    deviceStatus.add(thumbstickRow);

    const liveInputHeading = new Gtk.Label({
        label: 'Live input',
        halign: Gtk.Align.START,
    });
    liveInputHeading.add_css_class('title-2');

    const liveInputStatus = new Gtk.Label({
        halign: Gtk.Align.START,
        wrap: true,
    });
    liveInputStatus.add_css_class('dim-label');

    const keyboardOutputStatus = new Gtk.Label({
        halign: Gtk.Align.START,
        wrap: true,
    });
    keyboardOutputStatus.add_css_class('dim-label');

    const mappingStore = new KeyboardMappingStore(
        undefined,
        detectG13ActiveProfile(),
    );
    let window = null;
    let deviceView = null;
    let mappingRuntime = null;
    const keyboardOutputState = {
        available: false,
        gamepadAvailable: false,
        error: null,
        initialized: false,
    };

    const refreshKeyboardOutputStatus = () => {
        if (!keyboardOutputState.initialized)
            return;

        keyboardOutputStatus.remove_css_class('success');
        keyboardOutputStatus.remove_css_class('warning');
        keyboardOutputStatus.remove_css_class('error');

        if (keyboardOutputState.available) {
            const profile = profileTitle(mappingStore.activeProfile);
            const mode = mappingStore.thumbstickMode === 'gamepad'
                ? `${thumbstickModeTitle(mappingStore.thumbstickMode)} · ` +
                    `${mappingStore.gamepadStick === 'left' ? 'Left' : 'Right'} stick`
                : thumbstickModeTitle(mappingStore.thumbstickMode);

            if (keyboardOutputState.gamepadAvailable) {
                keyboardOutputStatus.label =
                    'System-wide keyboard and gamepad output ready for GNOME, ' +
                    `X11, Wayland, and games. ${profile} · ${mode}.`;
                keyboardOutputStatus.add_css_class('success');
            } else if (mappingStore.thumbstickMode === 'gamepad') {
                keyboardOutputStatus.label =
                    'Keyboard output is ready, but virtual gamepad output is ' +
                    `unavailable: ${keyboardOutputState.error}`;
                keyboardOutputStatus.add_css_class('warning');
            } else {
                keyboardOutputStatus.label =
                    `System-wide keyboard output ready. ${profile} · ${mode}. ` +
                    `Virtual gamepad unavailable: ${keyboardOutputState.error}`;
                keyboardOutputStatus.add_css_class('success');
            }
        } else {
            keyboardOutputStatus.label =
                `Keyboard output unavailable: ${keyboardOutputState.error}`;
            keyboardOutputStatus.add_css_class('warning');
        }
    };

    const refreshMappingLabels = () => {
        for (const control of PROGRAMMABLE_CONTROLS) {
            const keyboardEvent = KEYBOARD_EVENT_BY_CODE.get(
                mappingStore.get(control),
            );
            deviceView.setMapping(
                control,
                keyboardEvent?.shortLabel ?? null,
            );
        }
    };

    const selectProfile = profile => {
        if (profile === mappingStore.activeProfile) {
            deviceView.setActiveProfile(profile);
            return;
        }

        try {
            mappingRuntime?.release();
            mappingStore.setActiveProfile(profile);
            deviceView.setActiveProfile(profile);
            refreshMappingLabels();
            refreshKeyboardOutputStatus();
        } catch (error) {
            keyboardOutputStatus.label =
                `Unable to select ${profileTitle(profile)}: ${error.message}`;
            keyboardOutputStatus.remove_css_class('success');
            keyboardOutputStatus.add_css_class('error');
        }
    };

    const showKeyboardMappingDialog = control => {
        const profile = mappingStore.activeProfile;
        const currentCode = mappingStore.get(control, profile);
        const currentIndex = KEYBOARD_EVENTS.findIndex(event =>
            event.code === currentCode
        );
        const dropdown = new Gtk.DropDown({
            model: Gtk.StringList.new([
                'Not assigned',
                ...KEYBOARD_EVENTS.map(event => event.label),
            ]),
            selected: currentIndex + 1,
            enable_search: true,
        });
        const dialog = new Adw.MessageDialog({
            transient_for: window,
            heading: `Map ${controlTitle(control)} · ${profileTitle(profile)}`,
            body: 'Choose the keyboard event emitted while this control is held.',
            extra_child: dropdown,
            close_response: 'cancel',
            default_response: 'save',
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save');
        dialog.set_response_appearance(
            'save',
            Adw.ResponseAppearance.SUGGESTED,
        );
        dialog.connect('response', (_source, response) => {
            if (response !== 'save')
                return;

            const keyboardEvent = dropdown.selected === 0
                ? null
                : KEYBOARD_EVENTS[dropdown.selected - 1];

            try {
                mappingRuntime?.release([control]);
                mappingStore.set(
                    control,
                    keyboardEvent?.code ?? null,
                    profile,
                );

                if (profile === mappingStore.activeProfile) {
                    deviceView.setMapping(
                        control,
                        keyboardEvent?.shortLabel ?? null,
                    );
                }

                refreshKeyboardOutputStatus();
            } catch (error) {
                keyboardOutputStatus.label =
                    `Unable to save keyboard mapping: ${error.message}`;
                keyboardOutputStatus.remove_css_class('success');
                keyboardOutputStatus.add_css_class('error');
            }
        });
        dialog.present();
    };

    let thumbstickOutput = null;
    let latestPresence = {
        keypad: false,
        thumbstick: false,
        hidrawDevice: null,
        eventDevices: {keypad: null, thumbstick: null},
        available: false,
    };
    let previousBacklightOn = null;

    const parseHudColor = color => [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
    ];

    const applyLighting = () => {
        if (!latestPresence.hidrawDevice)
            return;

        const [red, green, blue] = parseHudColor(mappingStore.hudColor);
        keyboardEmitter?.setLighting(
            latestPresence.hidrawDevice,
            red,
            green,
            blue,
            mappingStore.hudBrightness,
        );
    };

    const selectThumbstickMode = mode => {
        try {
            mappingStore.setThumbstickMode(mode);
            mappingRuntime?.release(THUMB_PROGRAMMABLE_CONTROLS);
            thumbstickOutput?.setMode(mode);
            deviceView.setThumbstickMode(mode);
            refreshKeyboardOutputStatus();
        } catch (error) {
            deviceView.setThumbstickMode(mappingStore.thumbstickMode);
            keyboardOutputStatus.label =
                `Unable to select ${thumbstickModeTitle(mode)}: ${error.message}`;
            keyboardOutputStatus.remove_css_class('success');
            keyboardOutputStatus.add_css_class('error');
        }
    };

    const selectGamepadStick = stick => {
        try {
            mappingStore.setGamepadStick(stick);
            thumbstickOutput?.setGamepadStick(stick);
            deviceView.setGamepadStick(stick);
            refreshKeyboardOutputStatus();
        } catch (error) {
            deviceView.setGamepadStick(mappingStore.gamepadStick);
            keyboardOutputStatus.label =
                `Unable to select ${stick} gamepad stick: ${error.message}`;
            keyboardOutputStatus.remove_css_class('success');
            keyboardOutputStatus.add_css_class('error');
        }
    };

    const selectLighting = (color, brightness) => {
        try {
            mappingStore.setLighting(color, brightness);
            deviceView.setLighting(
                mappingStore.hudColor,
                mappingStore.hudBrightness,
            );
            applyLighting();
        } catch (error) {
            deviceView.setLighting(
                mappingStore.hudColor,
                mappingStore.hudBrightness,
            );
            keyboardOutputStatus.label =
                `Unable to save HUD lighting: ${error.message}`;
            keyboardOutputStatus.remove_css_class('success');
            keyboardOutputStatus.add_css_class('error');
        }
    };

    deviceView = new G13DeviceView({
        onConfigure: showKeyboardMappingDialog,
        onSelectProfile: selectProfile,
        onSelectThumbstickMode: selectThumbstickMode,
        onSelectGamepadStick: selectGamepadStick,
        onLightingChanged: selectLighting,
    });
    deviceView.setActiveProfile(mappingStore.activeProfile);
    deviceView.setThumbstickMode(mappingStore.thumbstickMode);
    deviceView.setGamepadStick(mappingStore.gamepadStick);
    deviceView.setLighting(
        mappingStore.hudColor,
        mappingStore.hudBrightness,
    );
    refreshMappingLabels();

    const keyboardEmitter = new KeyboardEmitter((available, error, gamepadAvailable) => {
        keyboardOutputState.available = available;
        keyboardOutputState.gamepadAvailable = gamepadAvailable;
        keyboardOutputState.error = error;
        keyboardOutputState.initialized = true;
        mappingRuntime?.reset();
        thumbstickOutput?.reset();
        refreshKeyboardOutputStatus();

        if (available)
            applyLighting();

        if (available)
            applyPhysicalThumbstickGrab(true);
    });
    mappingRuntime = new KeyboardMappingRuntime(
        mappingStore,
        (code, pressed) => keyboardEmitter.emitKey(code, pressed),
    );
    thumbstickOutput = new ThumbstickOutputRuntime({
        emitKey: (code, pressed) => keyboardEmitter.emitKey(code, pressed),
        emitAxis: (stick, x, y) =>
            keyboardEmitter.emitGamepadAxes(stick, x, y),
        emitButton: (index, pressed) =>
            keyboardEmitter.emitGamepadButton(index, pressed),
    }, mappingStore.thumbstickMode, mappingStore.gamepadStick);

    const profileButtonStates = new Map(
        PROFILES.map(profile => [profile, false]),
    );

    const updatePhysicalControl = (control, pressed) => {
        deviceView.setPressed(control, pressed);

        if (profileButtonStates.has(control)) {
            const previous = profileButtonStates.get(control);
            profileButtonStates.set(control, pressed);

            if (pressed && !previous)
                selectProfile(control);

            return;
        }

        if (
            THUMB_PROGRAMMABLE_CONTROLS.includes(control) &&
            thumbstickOutput.updateButton(control, pressed)
        ) {
            mappingRuntime.update(control, false);
            return;
        }

        mappingRuntime.update(control, pressed);
    };

    const inputAccess = {
        keypad: {available: false, error: null},
        thumbstick: {available: false, error: null},
    };
    const thumbAxes = {x: 128, y: 128};
    const updateLiveInputStatus = () => {
        const errors = Object.values(inputAccess)
            .map(access => access.error)
            .filter(error => error);

        if (!latestPresence.available) {
            liveInputStatus.label = 'Live input detection is unavailable.';
        } else if (!latestPresence.keypad && !latestPresence.thumbstick) {
            liveInputStatus.label = 'Connect a G13 to see key presses.';
        } else if (errors.length > 0) {
            liveInputStatus.label =
                'G13 detected, but live input cannot be read. Check input-device permissions.';
        } else if (
            inputAccess.keypad.available &&
            inputAccess.thumbstick.available
        ) {
            liveInputStatus.label =
                'Press any control to highlight it. The thumbstick supports diagonals and click.';
        } else {
            liveInputStatus.label = 'Opening the connected G13 input devices…';
        }

        liveInputStatus.tooltip_text = errors.join('\n') || null;
    };

    const inputMonitor = new G13InputMonitor({
        onSnapshot: snapshot => {
            for (const [control, pressed] of Object.entries(snapshot.controls))
                updatePhysicalControl(control, pressed);

            thumbAxes.x = snapshot.x;
            thumbAxes.y = snapshot.y;
            deviceView.setThumbAxes(thumbAxes.x, thumbAxes.y);
            thumbstickOutput.updateAxes(thumbAxes.x, thumbAxes.y);

            deviceView.setBacklightOn(snapshot.backlightOn);

            if (snapshot.backlightOn && previousBacklightOn === false)
                applyLighting();

            previousBacklightOn = snapshot.backlightOn;
        },
        onEvent: (kind, event) => {
            if (event.type === EVENT_TYPE_KEY) {
                const control = G13_KEY_CONTROLS.get(event.code);

                if (control)
                    updatePhysicalControl(control, event.value !== 0);
            } else if (
                kind === 'thumbstick' &&
                event.type === EVENT_TYPE_ABSOLUTE
            ) {
                if (event.code === ABS_X)
                    thumbAxes.x = event.value;
                else if (event.code === ABS_Y)
                    thumbAxes.y = event.value;
                else
                    return;

                deviceView.setThumbAxes(thumbAxes.x, thumbAxes.y);
                thumbstickOutput.updateAxes(thumbAxes.x, thumbAxes.y);
            }
        },
        onAccessChanged: (kind, available, error) => {
            inputAccess[kind] = {available, error};

            if (!available) {
                if (kind === 'keypad')
                    deviceView.clearKeypad();
                else
                    deviceView.clearThumbstick();

                if (kind === 'keypad') {
                    for (const profile of PROFILES)
                        profileButtonStates.set(profile, false);
                }

                mappingRuntime.release(kind === 'keypad'
                    ? KEYPAD_PROGRAMMABLE_CONTROLS
                    : THUMB_PROGRAMMABLE_CONTROLS);

                if (kind === 'thumbstick')
                    thumbstickOutput.release();
            }

            updateLiveInputStatus();
        },
    });

    let previousPresence = '';
    let previousLightingDevice = null;
    let previousGrabPath;

    const applyPhysicalThumbstickGrab = (force = false) => {
        const path = inputMonitor.usingRawDevice
            ? latestPresence.eventDevices?.thumbstick ?? null
            : null;

        if (!force && path === previousGrabPath)
            return;

        previousGrabPath = path;
        keyboardEmitter.grabPhysicalThumbstick(path);
    };

    const updateStatusRow = (row, statusIcon, present, available) => {
        row.subtitle = available
            ? (present ? 'Present' : 'Not detected')
            : 'Detection unavailable';
        statusIcon.icon_name = present
            ? 'emblem-ok-symbolic'
            : 'dialog-warning-symbolic';
        statusIcon.tooltip_text = row.subtitle;
        statusIcon.remove_css_class('success');
        statusIcon.remove_css_class('warning');
        statusIcon.add_css_class(present ? 'success' : 'warning');
    };

    const refreshDeviceStatus = () => {
        const presence = scanForG13();
        const presenceKey = JSON.stringify(presence);

        latestPresence = presence;
        inputMonitor.sync(presence);
        applyPhysicalThumbstickGrab();
        updateLiveInputStatus();

        if (presence.hidrawDevice !== previousLightingDevice) {
            previousLightingDevice = presence.hidrawDevice;
            previousBacklightOn = null;
            deviceView.setBacklightOn(null);

            if (presence.hidrawDevice)
                applyLighting();
        }

        if (presenceKey === previousPresence)
            return GLib.SOURCE_CONTINUE;

        previousPresence = presenceKey;
        updateStatusRow(
            keypadRow,
            keypadStatus,
            presence.keypad,
            presence.available,
        );
        updateStatusRow(
            thumbstickRow,
            thumbstickStatus,
            presence.thumbstick,
            presence.available,
        );

        if (!presence.available)
            message.label = 'Unable to check Linux input devices.';
        else if (presence.keypad && presence.thumbstick)
            message.label = 'G13 keypad and thumbstick are connected.';
        else if (presence.keypad || presence.thumbstick)
            message.label = 'The G13 is only partially detected.';
        else
            message.label = 'Connect a Logitech G13 to get started.';

        return GLib.SOURCE_CONTINUE;
    };

    const content = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 16,
        margin_top: 24,
        margin_bottom: 24,
        margin_start: 24,
        margin_end: 24,
    });
    content.append(icon);
    content.append(heading);
    content.append(version);
    content.append(message);
    content.append(deviceStatus);
    content.append(liveInputHeading);
    content.append(liveInputStatus);
    content.append(keyboardOutputStatus);
    content.append(deviceView.widget);

    const clamp = new Adw.Clamp({
        maximum_size: 900,
        tightening_threshold: 700,
        child: content,
    });

    const scroller = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        child: clamp,
    });

    const toolbar = new Adw.ToolbarView();
    toolbar.add_top_bar(header);
    toolbar.content = scroller;

    window = new Adw.ApplicationWindow({
        application: app,
        title: 'G13 Control Center',
        default_width: 820,
        default_height: 700,
        content: toolbar,
    });

    refreshDeviceStatus();
    const refreshSource = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        2,
        refreshDeviceStatus,
    );

    window.connect('close-request', () => {
        window.set_visible(false);
        return true;
    });

    let stopped = false;
    return {
        window,
        stop() {
            if (stopped)
                return;

            stopped = true;
            GLib.source_remove(refreshSource);
            mappingRuntime.release();
            thumbstickOutput.release();
            keyboardEmitter.stop();
            inputMonitor.stop();
        },
    };
}

const windowLifecycle = new WindowLifecycle(() => createMainWindow(application));
let statusNotifier = null;

application.connect('startup', app => {
    app.hold();
    statusNotifier = new StatusNotifier({
        title: `${APPLICATION_NAME} ${APPLICATION_VERSION}`,
        onActivate: () => windowLifecycle.activate(),
        onExit: () => app.quit(),
    });
});

application.connect('activate', () => windowLifecycle.activate());

application.connect('shutdown', () => {
    statusNotifier?.stop();
    windowLifecycle.stop();
});

application.run(ARGV);
