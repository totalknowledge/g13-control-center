export const APPLICATION_ID = 'io.github.aretedriver.G13ControlCenter';
export const APPLICATION_NAME = 'G13 Control Center';
export const APPLICATION_VERSION = '0.1.3';

export class WindowLifecycle {
    constructor(createWindow) {
        if (typeof createWindow !== 'function')
            throw new TypeError('createWindow must be a function');

        this._createWindow = createWindow;
        this._managedWindow = null;
    }

    get window() {
        return this._managedWindow?.window ?? null;
    }

    activate() {
        if (this._managedWindow === null)
            this._managedWindow = this._createWindow();

        this._managedWindow.window.present();
        return this._managedWindow.window;
    }

    hide() {
        this.window?.set_visible(false);
    }

    stop() {
        if (this._managedWindow === null)
            return;

        const managedWindow = this._managedWindow;
        this._managedWindow = null;
        managedWindow.stop();
    }
}
