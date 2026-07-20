import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const ITEM_PATH = '/StatusNotifierItem';
const MENU_PATH = '/StatusNotifierMenu';
const WATCHER_NAME = 'org.kde.StatusNotifierWatcher';
const WATCHER_PATH = '/StatusNotifierWatcher';

const ITEM_XML = `
<node>
  <interface name="org.kde.StatusNotifierItem">
    <method name="ContextMenu"><arg name="x" type="i" direction="in"/><arg name="y" type="i" direction="in"/></method>
    <method name="Activate"><arg name="x" type="i" direction="in"/><arg name="y" type="i" direction="in"/></method>
    <method name="SecondaryActivate"><arg name="x" type="i" direction="in"/><arg name="y" type="i" direction="in"/></method>
    <method name="Scroll"><arg name="delta" type="i" direction="in"/><arg name="orientation" type="s" direction="in"/></method>
    <property name="Category" type="s" access="read"/>
    <property name="Id" type="s" access="read"/>
    <property name="Title" type="s" access="read"/>
    <property name="Status" type="s" access="read"/>
    <property name="WindowId" type="u" access="read"/>
    <property name="IconName" type="s" access="read"/>
    <property name="IconPixmap" type="a(iiay)" access="read"/>
    <property name="OverlayIconName" type="s" access="read"/>
    <property name="OverlayIconPixmap" type="a(iiay)" access="read"/>
    <property name="AttentionIconName" type="s" access="read"/>
    <property name="AttentionIconPixmap" type="a(iiay)" access="read"/>
    <property name="AttentionMovieName" type="s" access="read"/>
    <property name="ToolTip" type="(sa(iiay)ss)" access="read"/>
    <property name="ItemIsMenu" type="b" access="read"/>
    <property name="Menu" type="o" access="read"/>
    <signal name="NewTitle"/>
    <signal name="NewIcon"/>
    <signal name="NewAttentionIcon"/>
    <signal name="NewOverlayIcon"/>
    <signal name="NewToolTip"/>
    <signal name="NewStatus"><arg name="status" type="s"/></signal>
  </interface>
</node>`;

const MENU_XML = `
<node>
  <interface name="com.canonical.dbusmenu">
    <method name="GetLayout">
      <arg name="parentId" type="i" direction="in"/>
      <arg name="recursionDepth" type="i" direction="in"/>
      <arg name="propertyNames" type="as" direction="in"/>
      <arg name="revision" type="u" direction="out"/>
      <arg name="layout" type="(ia{sv}av)" direction="out"/>
    </method>
    <method name="GetGroupProperties">
      <arg name="ids" type="ai" direction="in"/>
      <arg name="propertyNames" type="as" direction="in"/>
      <arg name="properties" type="a(ia{sv})" direction="out"/>
    </method>
    <method name="GetProperty">
      <arg name="id" type="i" direction="in"/>
      <arg name="name" type="s" direction="in"/>
      <arg name="value" type="v" direction="out"/>
    </method>
    <method name="Event">
      <arg name="id" type="i" direction="in"/>
      <arg name="eventId" type="s" direction="in"/>
      <arg name="data" type="v" direction="in"/>
      <arg name="timestamp" type="u" direction="in"/>
    </method>
    <method name="EventGroup">
      <arg name="events" type="a(isvu)" direction="in"/>
      <arg name="idErrors" type="ai" direction="out"/>
    </method>
    <method name="AboutToShow"><arg name="id" type="i" direction="in"/><arg name="needUpdate" type="b" direction="out"/></method>
    <method name="AboutToShowGroup">
      <arg name="ids" type="ai" direction="in"/>
      <arg name="updatesNeeded" type="ai" direction="out"/>
      <arg name="idErrors" type="ai" direction="out"/>
    </method>
    <property name="Version" type="u" access="read"/>
    <property name="TextDirection" type="s" access="read"/>
    <property name="Status" type="s" access="read"/>
    <property name="IconThemePath" type="as" access="read"/>
    <signal name="ItemsPropertiesUpdated"><arg name="updatedProps" type="a(ia{sv})"/><arg name="removedProps" type="a(ias)"/></signal>
    <signal name="LayoutUpdated"><arg name="revision" type="u"/><arg name="parent" type="i"/></signal>
    <signal name="ItemActivationRequested"><arg name="id" type="i"/><arg name="timestamp" type="u"/></signal>
  </interface>
</node>`;

export const STATUS_MENU_ITEMS = Object.freeze([
    Object.freeze({id: 1, label: 'G13 Control Center', action: 'activate'}),
    Object.freeze({id: 2, label: 'Exit', action: 'exit'}),
]);

function itemProperties(item, requestedNames = []) {
    const all = {
        label: new GLib.Variant('s', item.label),
        enabled: new GLib.Variant('b', true),
        visible: new GLib.Variant('b', true),
    };

    if (requestedNames.length === 0)
        return all;

    return Object.fromEntries(
        requestedNames
            .filter(name => Object.hasOwn(all, name))
            .map(name => [name, all[name]]),
    );
}

export function menuLayout(requestedNames = []) {
    const children = STATUS_MENU_ITEMS.map(item =>
        new GLib.Variant('(ia{sv}av)', [
            item.id,
            itemProperties(item, requestedNames),
            [],
        ])
    );
    return [0, {}, children];
}

export class StatusMenu {
    constructor(onActivate, onExit) {
        this.Version = 3;
        this.TextDirection = 'ltr';
        this.Status = 'normal';
        this.IconThemePath = [];
        this._callbacks = new Map([
            [1, onActivate],
            [2, onExit],
        ]);
    }

    GetLayout(_parentId, _recursionDepth, propertyNames) {
        return [1, menuLayout(propertyNames)];
    }

    GetGroupProperties(ids, propertyNames) {
        const requestedIds = ids.length === 0
            ? STATUS_MENU_ITEMS.map(item => item.id)
            : ids;
        return [requestedIds
            .map(id => STATUS_MENU_ITEMS.find(item => item.id === id))
            .filter(item => item !== undefined)
            .map(item => [item.id, itemProperties(item, propertyNames)])];
    }

    GetProperty(id, name) {
        const item = STATUS_MENU_ITEMS.find(candidate => candidate.id === id);
        const properties = item === undefined ? {} : itemProperties(item);
        return [properties[name] ?? new GLib.Variant('s', '')];
    }

    Event(id, eventId, _data, _timestamp) {
        if (eventId === 'clicked')
            this._callbacks.get(id)?.();
    }

    EventGroup(events) {
        const errors = [];
        for (const [id, eventId, data, timestamp] of events) {
            if (this._callbacks.has(id))
                this.Event(id, eventId, data, timestamp);
            else
                errors.push(id);
        }
        return [errors];
    }

    AboutToShow(_id) {
        return [false];
    }

    AboutToShowGroup(ids) {
        return [[], ids.filter(id => !this._callbacks.has(id))];
    }
}

export class StatusItem {
    constructor(title, iconName, onActivate) {
        this.Category = 'ApplicationStatus';
        this.Id = 'g13-control-center';
        this.Title = title;
        this.Status = 'Active';
        this.WindowId = 0;
        this.IconName = iconName;
        this.IconPixmap = [];
        this.OverlayIconName = '';
        this.OverlayIconPixmap = [];
        this.AttentionIconName = '';
        this.AttentionIconPixmap = [];
        this.AttentionMovieName = '';
        this.ToolTip = [iconName, [], title, 'Logitech G13 controller'];
        this.ItemIsMenu = false;
        this.Menu = MENU_PATH;
        this._onActivate = onActivate;
    }

    Activate(_x, _y) {
        this._onActivate();
    }

    SecondaryActivate(x, y) {
        this.Activate(x, y);
    }

    ContextMenu(_x, _y) {}
    Scroll(_delta, _orientation) {}
}

export class StatusNotifier {
    constructor({title, iconName = 'input-gaming-symbolic', onActivate, onExit}) {
        this._connection = Gio.bus_get_sync(Gio.BusType.SESSION, null);
        this._itemObject = Gio.DBusExportedObject.wrapJSObject(
            ITEM_XML,
            new StatusItem(title, iconName, onActivate),
        );
        this._menuObject = Gio.DBusExportedObject.wrapJSObject(
            MENU_XML,
            new StatusMenu(onActivate, onExit),
        );
        this._itemObject.export(this._connection, ITEM_PATH);
        this._menuObject.export(this._connection, MENU_PATH);
        this._watchId = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            WATCHER_NAME,
            Gio.BusNameWatcherFlags.NONE,
            connection => this._register(connection),
            () => {},
        );
    }

    _register(connection) {
        connection.call(
            WATCHER_NAME,
            WATCHER_PATH,
            WATCHER_NAME,
            'RegisterStatusNotifierItem',
            new GLib.Variant('(s)', [this._connection.get_unique_name()]),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (source, result) => {
                try {
                    source.call_finish(result);
                } catch (error) {
                    console.warn(`Could not register status icon: ${error.message}`);
                }
            },
        );
    }

    stop() {
        if (this._watchId !== 0) {
            Gio.bus_unwatch_name(this._watchId);
            this._watchId = 0;
        }
        this._menuObject.unexport();
        this._itemObject.unexport();
    }
}
