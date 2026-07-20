import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix?version=2.0';
import GLib from 'gi://GLib';

export const EVENT_TYPE_KEY = 0x01;
export const EVENT_TYPE_ABSOLUTE = 0x03;
export const ABS_X = 0x00;
export const ABS_Y = 0x01;

const KEY_MACRO1 = 0x290;
const KEY_MACRO_RECORD_START = 0x2b0;
const KEY_MACRO_PRESET1 = 0x2b3;
const KEY_KBD_LCD_MENU1 = 0x2b8;
const KEY_LIGHTS_TOGGLE = 0x21e;
const BTN_THUMB = 0x121;
const BTN_BASE = 0x126;
const BTN_BASE2 = 0x127;

const NATIVE_LITTLE_ENDIAN = new Uint8Array(
    new Uint16Array([1]).buffer,
)[0] === 1;

export const G13_KEY_CONTROLS = new Map([
    [KEY_MACRO_RECORD_START, 'mr'],
    [KEY_MACRO_PRESET1, 'm1'],
    [KEY_MACRO_PRESET1 + 1, 'm2'],
    [KEY_MACRO_PRESET1 + 2, 'm3'],
    [KEY_KBD_LCD_MENU1, 'lcd1'],
    [KEY_KBD_LCD_MENU1 + 1, 'lcd2'],
    [KEY_KBD_LCD_MENU1 + 2, 'lcd3'],
    [KEY_KBD_LCD_MENU1 + 3, 'lcd4'],
    [KEY_KBD_LCD_MENU1 + 4, 'lcd-page'],
    [KEY_LIGHTS_TOGGLE, 'backlight'],
    [BTN_BASE, 'thumb-side'],
    [BTN_BASE2, 'thumb-bottom'],
    [BTN_THUMB, 'thumb-press'],
]);

for (let index = 0; index < 22; index++)
    G13_KEY_CONTROLS.set(KEY_MACRO1 + index, `g${index + 1}`);

const G13_HID_BIT_CONTROLS = new Map([
    [24, 'lcd-page'],
    [25, 'lcd1'],
    [26, 'lcd2'],
    [27, 'lcd3'],
    [28, 'lcd4'],
    [29, 'm1'],
    [30, 'm2'],
    [31, 'm3'],
    [32, 'mr'],
    [33, 'thumb-side'],
    [34, 'thumb-bottom'],
    [35, 'thumb-press'],
    [37, 'backlight'],
]);

for (let index = 0; index < 22; index++)
    G13_HID_BIT_CONTROLS.set(index, `g${index + 1}`);

export function inputEventSize(longSize = GLib.SIZEOF_LONG) {
    return longSize * 2 + 8;
}

export function decodeInputEvent(
    bytes,
    longSize = GLib.SIZEOF_LONG,
    littleEndian = NATIVE_LITTLE_ENDIAN,
) {
    const size = inputEventSize(longSize);

    if (bytes.byteLength < size)
        throw new Error(`Input event requires ${size} bytes`);

    const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
    );
    const dataOffset = longSize * 2;

    return {
        type: view.getUint16(dataOffset, littleEndian),
        code: view.getUint16(dataOffset + 2, littleEndian),
        value: view.getInt32(dataOffset + 4, littleEndian),
    };
}

export function thumbDirections(x, y) {
    return {
        left: x < 96,
        right: x > 160,
        up: y < 96,
        down: y > 160,
    };
}

export function decodeG13HidReport(bytes) {
    if (bytes.byteLength < 8)
        throw new Error('G13 HID report requires 8 bytes');

    if (bytes[0] !== 1)
        return null;

    const controls = {};

    for (const [bit, control] of G13_HID_BIT_CONTROLS) {
        const byte = bytes[3 + Math.floor(bit / 8)];
        controls[control] = (byte & (1 << (bit % 8))) !== 0;
    }

    return {
        x: bytes[1],
        y: bytes[2],
        backlightOn: (bytes[3 + Math.floor(23 / 8)] & (1 << (23 % 8))) !== 0,
        controls,
    };
}

class FramedDeviceReader {
    constructor(path, frameSize, decode, onFrame, onStopped) {
        this.path = path;
        this._frameSize = frameSize;
        this._decode = decode;
        this._onFrame = onFrame;
        this._onStopped = onStopped;
        this._cancellable = new Gio.Cancellable();
        this._stream = null;
        this._pending = new Uint8Array();
        this._stopped = false;
    }

    start() {
        const fd = GLib.open(this.path, 0, 0);

        if (fd < 0)
            throw new Error(`Unable to open ${this.path}`);

        this._stream = new GioUnix.InputStream({
            fd,
            close_fd: true,
        });
        this._readNext();
    }

    stop() {
        if (this._stopped)
            return;

        this._stopped = true;
        this._cancellable.cancel();

        try {
            this._stream?.close(null);
        } catch {
            // The stream may already be closed after an unplug event.
        }
    }

    _readNext() {
        this._stream.read_bytes_async(
            this._frameSize * 16,
            GLib.PRIORITY_DEFAULT,
            this._cancellable,
            (stream, result) => {
                try {
                    const bytes = stream.read_bytes_finish(result).get_data();

                    if (bytes.length === 0)
                        throw new Error('Input device was disconnected');

                    const combined = new Uint8Array(
                        this._pending.length + bytes.length,
                    );
                    combined.set(this._pending);
                    combined.set(bytes, this._pending.length);
                    this._pending = combined;

                    while (this._pending.length >= this._frameSize) {
                        const frame = this._pending.subarray(
                            0,
                            this._frameSize,
                        );
                        const decoded = this._decode(frame);

                        if (decoded !== null)
                            this._onFrame(decoded);

                        this._pending = this._pending.slice(this._frameSize);
                    }

                    this._readNext();
                } catch (error) {
                    if (!this._stopped && !this._cancellable.is_cancelled()) {
                        this.stop();
                        this._onStopped(error);
                    }
                }
            },
        );
    }
}

export class G13InputMonitor {
    constructor({onEvent, onSnapshot = () => {}, onAccessChanged}) {
        this._onEvent = onEvent;
        this._onSnapshot = onSnapshot;
        this._onAccessChanged = onAccessChanged;
        this._rawReader = null;
        this._readers = {
            keypad: null,
            thumbstick: null,
        };
    }

    get usingRawDevice() {
        return this._rawReader !== null;
    }

    sync({hidrawDevice, eventDevices}) {
        if (hidrawDevice && this._syncRawDevice(hidrawDevice)) {
            this._stopEventReaders();
            return;
        }

        this._rawReader?.stop();
        this._rawReader = null;
        this._syncEventDevice('keypad', eventDevices.keypad);
        this._syncEventDevice('thumbstick', eventDevices.thumbstick);
    }

    stop() {
        this._rawReader?.stop();
        this._rawReader = null;

        for (const kind of Object.keys(this._readers)) {
            this._readers[kind]?.stop();
            this._readers[kind] = null;
        }
    }

    _syncRawDevice(path) {
        if (this._rawReader?.path === path)
            return true;

        this._rawReader?.stop();
        this._rawReader = null;

        const reader = new FramedDeviceReader(
            path,
            8,
            decodeG13HidReport,
            snapshot => this._onSnapshot(snapshot),
            error => {
                if (this._rawReader !== reader)
                    return;

                this._rawReader = null;
                this._onAccessChanged('keypad', false, error.message);
                this._onAccessChanged('thumbstick', false, error.message);
            },
        );

        try {
            reader.start();
            this._rawReader = reader;
            this._onAccessChanged('keypad', true, null);
            this._onAccessChanged('thumbstick', true, null);
            return true;
        } catch {
            reader.stop();
            return false;
        }
    }

    _stopEventReaders() {
        for (const kind of Object.keys(this._readers)) {
            this._readers[kind]?.stop();
            this._readers[kind] = null;
        }
    }

    _syncEventDevice(kind, path) {
        const current = this._readers[kind];

        if (current?.path === path)
            return;

        current?.stop();
        this._readers[kind] = null;

        if (!path) {
            this._onAccessChanged(kind, false, null);
            return;
        }

        const reader = new FramedDeviceReader(
            path,
            inputEventSize(),
            decodeInputEvent,
            event => this._onEvent(kind, event),
            error => {
                if (this._readers[kind] !== reader)
                    return;

                this._readers[kind] = null;
                this._onAccessChanged(kind, false, error.message);
            },
        );

        try {
            reader.start();
            this._readers[kind] = reader;
            this._onAccessChanged(kind, true, null);
        } catch (error) {
            reader.stop();
            this._onAccessChanged(kind, false, error.message);
        }
    }
}
