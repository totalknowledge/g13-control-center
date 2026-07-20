import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';

import {thumbDirections} from './input-monitor.js';
import {
    DEFAULT_HUD_BRIGHTNESS,
    DEFAULT_HUD_COLOR,
    GAMEPAD_STICKS,
    PROGRAMMABLE_CONTROLS,
    PROFILES,
    THUMBSTICK_MODES,
} from './key-mappings.js';

const PROGRAMMABLE_CONTROL_SET = new Set(PROGRAMMABLE_CONTROLS);
const PROFILE_CONTROL_SET = new Set(PROFILES);

export const G13_LAYOUT_CSS = `
.g13-panel {
    padding: 16px;
    border: 1px solid alpha(@window_fg_color, 0.12);
    border-radius: 12px;
    background-color: alpha(@window_fg_color, 0.045);
}

.g13-key {
    min-width: 38px;
    min-height: 28px;
    padding: 5px 7px;
    border: 1px solid alpha(@window_fg_color, 0.18);
    border-radius: 7px;
    background-color: alpha(@window_fg_color, 0.08);
    font-weight: 700;
}

.g13-key.active-profile {
    color: @accent_color;
    border-color: @accent_bg_color;
    background-color: alpha(@accent_bg_color, 0.18);
    box-shadow: 0 0 0 2px alpha(@accent_bg_color, 0.18);
}

.g13-key.pressed {
    color: @accent_fg_color;
    border-color: @accent_bg_color;
    background-color: @accent_bg_color;
    box-shadow: 0 0 0 2px alpha(@accent_bg_color, 0.28);
}

.g13-key.g13-programmable:hover,
.g13-key.g13-profile:hover {
    background-color: alpha(@accent_bg_color, 0.16);
}

.g13-assignment {
    font-size: 0.78em;
    font-weight: 500;
    color: alpha(@window_fg_color, 0.7);
}

.g13-key.pressed .g13-assignment {
    color: @accent_fg_color;
}

.g13-thumb-direction {
    min-width: 32px;
    min-height: 32px;
    padding: 3px;
    border-radius: 20px;
}

.g13-thumb-center {
    min-width: 42px;
    min-height: 42px;
    border-radius: 24px;
}

.g13-mode-switch button {
    min-width: 72px;
}

.g13-lighting-row {
    padding: 2px 0 4px;
}
`;

const BRIGHTNESS_LEVELS = [64, 128, 192, 255];

function sectionLabel(text) {
    const label = new Gtk.Label({
        label: text,
        halign: Gtk.Align.START,
    });
    label.add_css_class('heading');
    label.add_css_class('dim-label');
    return label;
}

export class G13DeviceView {
    constructor({
        onConfigure = () => {},
        onSelectProfile = () => {},
        onSelectThumbstickMode = () => {},
        onSelectGamepadStick = () => {},
        onLightingChanged = () => {},
    } = {}) {
        this._controls = new Map();
        this._assignmentLabels = new Map();
        this._controlTooltips = new Map();
        this._onConfigure = onConfigure;
        this._onSelectProfile = onSelectProfile;
        this._onSelectThumbstickMode = onSelectThumbstickMode;
        this._onSelectGamepadStick = onSelectGamepadStick;
        this._onLightingChanged = onLightingChanged;
        this._thumbstickModeButtons = new Map();
        this._gamepadStickButtons = new Map();
        this._updatingThumbstickMode = false;
        this._updatingGamepadStick = false;
        this._updatingLighting = false;
        this._hudColor = DEFAULT_HUD_COLOR;
        this._hudBrightness = DEFAULT_HUD_BRIGHTNESS;
        this.widget = this._buildLayout();
    }

    setPressed(control, pressed) {
        const widget = this._controls.get(control);

        if (!widget)
            return;

        if (pressed)
            widget.add_css_class('pressed');
        else
            widget.remove_css_class('pressed');
    }

    setThumbAxes(x, y) {
        const directions = thumbDirections(x, y);

        for (const [direction, pressed] of Object.entries(directions))
            this.setPressed(`thumb-${direction}`, pressed);
    }

    setActiveProfile(profile) {
        for (const candidate of PROFILES) {
            const widget = this._controls.get(candidate);

            if (!widget)
                continue;

            if (candidate === profile)
                widget.add_css_class('active-profile');
            else
                widget.remove_css_class('active-profile');
        }
    }

    setMapping(control, mappingLabel) {
        const assignment = this._assignmentLabels.get(control);
        const widget = this._controls.get(control);

        if (!assignment || !widget)
            return;

        assignment.label = mappingLabel ?? '—';
        const title = this._controlTooltips.get(control);
        widget.tooltip_text = mappingLabel
            ? `${title} → ${mappingLabel}. Click to remap.`
            : `${title}. Click to assign a keyboard key.`;
    }

    setThumbstickMode(mode) {
        const button = this._thumbstickModeButtons.get(mode);

        if (!button)
            return;

        this._updatingThumbstickMode = true;
        button.active = true;
        this._gamepadStickRow.sensitive = mode === 'gamepad';
        this._updatingThumbstickMode = false;
    }

    setGamepadStick(stick) {
        const button = this._gamepadStickButtons.get(stick);

        if (!button)
            return;

        this._updatingGamepadStick = true;
        button.active = true;
        this._updatingGamepadStick = false;
    }

    setLighting(color, brightness) {
        const rgba = new Gdk.RGBA();

        if (!rgba.parse(color))
            return;

        this._hudColor = color.toLowerCase();
        this._hudBrightness = brightness;
        this._updatingLighting = true;
        this._colorButton.set_rgba(rgba);

        let nearest = 0;

        for (let index = 1; index < BRIGHTNESS_LEVELS.length; index++) {
            if (
                Math.abs(BRIGHTNESS_LEVELS[index] - brightness) <
                Math.abs(BRIGHTNESS_LEVELS[nearest] - brightness)
            ) {
                nearest = index;
            }
        }

        this._brightnessDropdown.selected = nearest;
        this._updatingLighting = false;
        this._refreshLightingStatus();
    }

    setBacklightOn(on) {
        this._backlightOn = on;
        this._refreshLightingStatus();
    }

    clearKeypad() {
        for (const control of this._controls.keys()) {
            if (!control.startsWith('thumb-'))
                this.setPressed(control, false);
        }
    }

    clearThumbstick() {
        for (const control of this._controls.keys()) {
            if (control.startsWith('thumb-'))
                this.setPressed(control, false);
        }
    }

    _createKey(control, label, tooltip = label) {
        const programmable = PROGRAMMABLE_CONTROL_SET.has(control);
        const profile = PROFILE_CONTROL_SET.has(control);
        let widget;

        if (programmable) {
            const assignment = new Gtk.Label({label: '—'});
            assignment.add_css_class('g13-assignment');

            const keyContent = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                valign: Gtk.Align.CENTER,
            });
            keyContent.append(new Gtk.Label({label}));
            keyContent.append(assignment);

            widget = new Gtk.Button({
                child: keyContent,
                tooltip_text: `${tooltip}. Click to assign a keyboard key.`,
                focus_on_click: false,
                has_frame: false,
            });
            widget.connect('clicked', () => this._onConfigure(control));
            widget.add_css_class('g13-programmable');
            this._assignmentLabels.set(control, assignment);
            this._controlTooltips.set(control, tooltip);
        } else if (profile) {
            widget = new Gtk.Button({
                label,
                tooltip_text: `${tooltip}. Click to select this profile.`,
                focus_on_click: false,
                has_frame: false,
            });
            widget.connect('clicked', () => this._onSelectProfile(control));
            widget.add_css_class('g13-profile');
        } else {
            widget = new Gtk.Label({
                label,
                tooltip_text: tooltip,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.CENTER,
            });
        }

        widget.add_css_class('g13-key');
        this._controls.set(control, widget);
        return widget;
    }

    _buildLayout() {
        const layout = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 18,
            halign: Gtk.Align.CENTER,
        });
        layout.append(this._buildKeypad());
        layout.append(this._buildThumbpad());
        return layout;
    }

    _buildKeypad() {
        const panel = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
        });
        panel.add_css_class('g13-panel');

        panel.append(sectionLabel('LCD controls'));

        const lcdRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            homogeneous: true,
        });
        lcdRow.append(this._createKey(
            'lcd-page',
            'Page',
            'LCD next page',
        ));
        lcdRow.append(this._createKey('lcd1', 'L1', 'LCD menu 1'));
        lcdRow.append(this._createKey('lcd2', 'L2', 'LCD menu 2'));
        lcdRow.append(this._createKey('lcd3', 'L3', 'LCD menu 3'));
        lcdRow.append(this._createKey('lcd4', 'L4', 'LCD menu 4'));
        lcdRow.append(this._createKey(
            'backlight',
            '*',
            'Backlight on/off',
        ));
        panel.append(lcdRow);

        const lightingRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            valign: Gtk.Align.CENTER,
        });
        lightingRow.add_css_class('g13-lighting-row');
        lightingRow.append(new Gtk.Label({
            label: 'HUD color',
            halign: Gtk.Align.START,
        }));

        let colorChangedSignal;

        if (Gtk.ColorDialogButton && Gtk.ColorDialog) {
            const colorDialog = new Gtk.ColorDialog({
                title: 'Choose G13 HUD color',
                with_alpha: false,
            });
            this._colorButton = new Gtk.ColorDialogButton({
                dialog: colorDialog,
                tooltip_text: 'Choose the LCD and key backlight color',
            });
            colorChangedSignal = 'notify::rgba';
        } else {
            // Compatibility fallback for GTK older than 4.10, where this
            // widget and its rgba property are not deprecated.
            this._colorButton = new Gtk.ColorButton({
                title: 'Choose G13 HUD color',
                use_alpha: false,
                tooltip_text: 'Choose the LCD and key backlight color',
            });
            colorChangedSignal = 'color-set';
        }

        this._colorButton.connect(colorChangedSignal, () => {
            if (this._updatingLighting)
                return;

            const rgba = this._colorButton.get_rgba();
            const channel = value => Math.round(value * 255)
                .toString(16)
                .padStart(2, '0');
            this._hudColor = `#${channel(rgba.red)}${channel(rgba.green)}${channel(rgba.blue)}`;
            this._notifyLightingChanged();
        });
        lightingRow.append(this._colorButton);

        lightingRow.append(new Gtk.Label({
            label: 'Brightness',
            margin_start: 6,
        }));
        this._brightnessDropdown = new Gtk.DropDown({
            model: Gtk.StringList.new(['25%', '50%', '75%', '100%']),
            tooltip_text: 'Set backlight brightness; * toggles it on or off',
        });
        this._brightnessDropdown.connect('notify::selected', () => {
            if (this._updatingLighting)
                return;

            this._hudBrightness = BRIGHTNESS_LEVELS[
                this._brightnessDropdown.selected
            ];
            this._notifyLightingChanged();
        });
        lightingRow.append(this._brightnessDropdown);
        panel.append(lightingRow);

        this._lightingStatus = new Gtk.Label({
            halign: Gtk.Align.START,
            wrap: true,
        });
        this._lightingStatus.add_css_class('dim-label');
        panel.append(this._lightingStatus);
        this.setLighting(this._hudColor, this._hudBrightness);

        const modeRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            homogeneous: true,
        });
        modeRow.append(this._createKey('m1', 'M1'));
        modeRow.append(this._createKey('m2', 'M2'));
        modeRow.append(this._createKey('m3', 'M3'));
        modeRow.append(this._createKey('mr', 'MR', 'Macro record'));
        panel.append(modeRow);

        panel.append(sectionLabel('G-keys'));

        const keys = new Gtk.Grid({
            row_spacing: 7,
            column_spacing: 7,
            column_homogeneous: true,
        });

        for (let index = 1; index <= 7; index++)
            keys.attach(this._createKey(`g${index}`, `G${index}`), index - 1, 0, 1, 1);

        for (let index = 8; index <= 14; index++)
            keys.attach(this._createKey(`g${index}`, `G${index}`), index - 8, 1, 1, 1);

        for (let index = 15; index <= 19; index++)
            keys.attach(this._createKey(`g${index}`, `G${index}`), index - 14, 2, 1, 1);

        for (let index = 20; index <= 22; index++)
            keys.attach(this._createKey(`g${index}`, `G${index}`), index - 18, 3, 1, 1);

        panel.append(keys);
        return panel;
    }

    _buildThumbpad() {
        const panel = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
        });
        panel.add_css_class('g13-panel');
        panel.append(sectionLabel('Thumbpad'));

        const outputLabel = new Gtk.Label({
            label: 'Output mode',
            halign: Gtk.Align.CENTER,
        });
        outputLabel.add_css_class('dim-label');
        panel.append(outputLabel);

        const modeSwitch = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            homogeneous: true,
            halign: Gtk.Align.CENTER,
        });
        modeSwitch.add_css_class('linked');
        modeSwitch.add_css_class('g13-mode-switch');
        const modeLabels = new Map([
            ['gamepad', 'Gamepad'],
            ['wasd', 'WASD'],
            ['arrows', 'Arrows'],
        ]);
        let firstButton = null;

        for (const mode of THUMBSTICK_MODES) {
            const button = new Gtk.ToggleButton({
                label: modeLabels.get(mode),
                tooltip_text: mode === 'gamepad'
                    ? 'Expose an analog gamepad to Linux and games'
                    : `Send ${mode === 'wasd' ? 'WASD' : 'arrow'} keyboard keys`,
            });

            if (firstButton)
                button.set_group(firstButton);
            else
                firstButton = button;

            button.connect('toggled', () => {
                if (button.active && !this._updatingThumbstickMode)
                    this._onSelectThumbstickMode(mode);
            });
            this._thumbstickModeButtons.set(mode, button);
            modeSwitch.append(button);
        }

        panel.append(modeSwitch);

        this._gamepadStickRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        const stickLabel = new Gtk.Label({
            label: 'Analog stick',
        });
        stickLabel.add_css_class('dim-label');
        this._gamepadStickRow.append(stickLabel);

        const stickSwitch = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 0,
            homogeneous: true,
        });
        stickSwitch.add_css_class('linked');
        let firstStickButton = null;

        for (const stick of GAMEPAD_STICKS) {
            const button = new Gtk.ToggleButton({
                label: stick === 'left' ? 'Left' : 'Right',
                tooltip_text: `Send analog movement as the gamepad's ${stick} stick`,
            });

            if (firstStickButton)
                button.set_group(firstStickButton);
            else
                firstStickButton = button;

            button.connect('toggled', () => {
                if (button.active && !this._updatingGamepadStick)
                    this._onSelectGamepadStick(stick);
            });
            this._gamepadStickButtons.set(stick, button);
            stickSwitch.append(button);
        }

        this._gamepadStickRow.append(stickSwitch);
        panel.append(this._gamepadStickRow);

        const directions = new Gtk.Grid({
            row_spacing: 5,
            column_spacing: 5,
            halign: Gtk.Align.CENTER,
        });

        const up = this._createKey('thumb-up', '↑', 'Thumbstick up');
        const left = this._createKey('thumb-left', '←', 'Thumbstick left');
        const press = this._createKey(
            'thumb-press',
            '●',
            'Thumbstick press',
        );
        const right = this._createKey('thumb-right', '→', 'Thumbstick right');
        const down = this._createKey('thumb-down', '↓', 'Thumbstick down');

        for (const direction of [up, left, right, down])
            direction.add_css_class('g13-thumb-direction');
        press.add_css_class('g13-thumb-center');

        directions.attach(up, 1, 0, 1, 1);
        directions.attach(left, 0, 1, 1, 1);
        directions.attach(press, 1, 1, 1, 1);
        directions.attach(right, 2, 1, 1, 1);
        directions.attach(down, 1, 2, 1, 1);
        panel.append(directions);

        const sideButtons = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 7,
            homogeneous: true,
        });
        sideButtons.append(this._createKey(
            'thumb-side',
            'Side',
            'Left thumb button',
        ));
        sideButtons.append(this._createKey(
            'thumb-bottom',
            'Lower',
            'Bottom thumb button',
        ));
        panel.append(sideButtons);

        return panel;
    }

    _notifyLightingChanged() {
        this._refreshLightingStatus();
        this._onLightingChanged(this._hudColor, this._hudBrightness);
    }

    _refreshLightingStatus() {
        if (!this._lightingStatus)
            return;

        if (this._backlightOn === false) {
            this._lightingStatus.label =
                'Backlight is off — press * once to turn it on.';
        } else {
            const percent = Math.round(this._hudBrightness / 255 * 100);
            this._lightingStatus.label =
                `Backlight ${percent}% · * toggles on/off`;
        }
    }
}
