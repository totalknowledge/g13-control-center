#!/usr/bin/env -S gjs -m

import Gtk from 'gi://Gtk?version=4.0';

import {G13_LAYOUT_CSS} from '../src/device-layout.js';

const provider = new Gtk.CssProvider();
provider.load_from_string(G13_LAYOUT_CSS);

print('device-layout CSS test passed');
