#!/usr/bin/env -S gjs -m

import GLib from 'gi://GLib';

import {
    menuLayout,
    STATUS_MENU_ITEMS,
    StatusItem,
    StatusMenu,
    StatusNotifier,
} from '../src/status-notifier.js';

function assertEqual(actual, expected, description) {
    if (actual !== expected)
        throw new Error(`${description}: expected ${expected}, received ${actual}`);
}

assertEqual(STATUS_MENU_ITEMS.length, 2, 'defines exactly two tray actions');
assertEqual(STATUS_MENU_ITEMS[0].label, 'G13 Control Center', 'labels the show action');
assertEqual(STATUS_MENU_ITEMS[1].label, 'Exit', 'labels the exit action');

const layout = menuLayout(['label']);
assertEqual(layout[0], 0, 'uses the root menu ID');
assertEqual(layout[2].length, 2, 'adds both actions to the root menu');
assertEqual(
    layout[2][0].deepUnpack()[1].label.deepUnpack(),
    'G13 Control Center',
    'exports the action label through D-Bus',
);

let activateCount = 0;
let exitCount = 0;
const menu = new StatusMenu(
    () => activateCount++,
    () => exitCount++,
);
assertEqual(menu.GetLayout(0, -1, [])[0], 1, 'exports menu revision one');
assertEqual(menu.GetGroupProperties([], []).at(0).length, 2, 'exports all properties');
assertEqual(menu.GetGroupProperties([99], []).at(0).length, 0, 'ignores unknown IDs');
assertEqual(menu.GetProperty(1, 'label')[0].deepUnpack(), 'G13 Control Center', 'gets a property');
assertEqual(menu.GetProperty(99, 'missing')[0].deepUnpack(), '', 'handles missing properties');
menu.Event(1, 'opened', new GLib.Variant('s', ''), 0);
menu.Event(1, 'clicked', new GLib.Variant('s', ''), 0);
assertEqual(activateCount, 1, 'activates the window from the menu');
assertEqual(menu.EventGroup([
    [2, 'clicked', new GLib.Variant('s', ''), 0],
    [99, 'clicked', new GLib.Variant('s', ''), 0],
])[0][0], 99, 'reports invalid grouped event IDs');
assertEqual(exitCount, 1, 'exits from the menu');
assertEqual(menu.AboutToShow(1)[0], false, 'does not request menu refreshes');
assertEqual(menu.AboutToShowGroup([1, 99])[1][0], 99, 'reports unknown show IDs');

const item = new StatusItem('G13 Control Center 0.1.3', 'input-gaming-symbolic', () => {
    activateCount++;
});
item.Activate(0, 0);
item.SecondaryActivate(0, 0);
item.ContextMenu(0, 0);
item.Scroll(1, 'vertical');
assertEqual(activateCount, 3, 'activates from primary and secondary icon clicks');
assertEqual(item.Menu, '/StatusNotifierMenu', 'advertises the tray menu path');

let registeredService = null;
let finishCount = 0;
const notifier = Object.create(StatusNotifier.prototype);
notifier._connection = {get_unique_name: () => ':1.23'};
notifier._register({
    call(service, _path, _interfaceName, _method, parameters, _replyType,
        _flags, _timeout, _cancellable, callback) {
        registeredService = service;
        assertEqual(parameters.deepUnpack()[0], ':1.23', 'registers its unique bus name');
        callback({call_finish: () => finishCount++}, {});
    },
});
assertEqual(registeredService, 'org.kde.StatusNotifierWatcher', 'uses the status watcher');
assertEqual(finishCount, 1, 'finishes tray registration');

notifier._watchId = 0;
let unexportCount = 0;
notifier._menuObject = {unexport: () => unexportCount++};
notifier._itemObject = {unexport: () => unexportCount++};
notifier.stop();
assertEqual(unexportCount, 2, 'unexports both D-Bus objects');

print('status notifier tests passed');

