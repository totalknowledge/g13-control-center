# G13 Control Center

[![Tests](https://github.com/totalknowledge/g13-control-center/actions/workflows/tests.yml/badge.svg)](https://github.com/totalknowledge/g13-control-center/actions/workflows/tests.yml)
[![Builds](https://github.com/totalknowledge/g13-control-center/actions/workflows/builds.yml/badge.svg)](https://github.com/totalknowledge/g13-control-center/actions/workflows/builds.yml)
[![Downloads](https://img.shields.io/github/downloads/totalknowledge/g13-control-center/total)](https://github.com/totalknowledge/g13-control-center/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A native GNOME application for configuring the Logitech G13. The interface is written in
GJS with GTK4 and libadwaita. Rust is reserved for background components that need it.
The current release is **0.1.3**.

## Install

Install the Debian package directly or open it with a graphical software
center:

```bash
sudo apt install ./g13-control-center_0.1.3_amd64.deb
```

Prebuilt Debian packages and source archives are available from the
[GitHub releases page](https://github.com/aretedriver/g13-control-center/releases).
Choose the `.deb` matching your machine architecture, or download the
`g13-control-center-0.1.3.tar.gz` source archive.

The package installs the application, compiled Rust helper, desktop and D-Bus
activation metadata, on-demand systemd user service, uinput module-load
configuration, and uaccess-based udev rule. Its post-install step loads uinput
and activates the device rule when the host supports it. No driver download,
manual configuration copy, or globally writable input device is required.

uinput is part of the Linux kernel. It is used to expose mapped G13 presses as
a normal system keyboard and the thumbstick as a standard analog gamepad to
GNOME, X11, Wayland, Steam, and games while G13 Control Center is running. The
package also loads the in-kernel `joydev` compatibility layer for games that
look for legacy `/dev/input/js*` devices.

## Build the Debian package

Ubuntu build dependencies:

```bash
sudo apt install appstream cargo desktop-file-utils dpkg-dev \
    gir1.2-adw-1 gir1.2-gtk-4.0 gjs rustc udev
```

### Repository-local build

The repository helper keeps every final Debian artifact under the source tree
and works with either distribution-packaged Rust or a `rustup` toolchain:

```bash
./packaging/build-deb.sh
```

It builds and validates the Rust helper, GJS tests, desktop metadata, AppStream
metadata, and udev rule. For an `amd64` build, the local paths are:

| Contents | Repository-local location |
| --- | --- |
| Cargo build output | `build/` |
| Release Rust helper | `build/release/g13-keyboard-helper` |
| Temporary package filesystem | `debian/g13-control-center/` |
| Generated dependency variables | `debian/g13-control-center.substvars` |
| Debian package file list | `debian/files` |
| Installable package | `dist/g13-control-center_0.1.3_amd64.deb` |
| Build information | `dist/g13-control-center_0.1.3_amd64.buildinfo` |
| Changes manifest | `dist/g13-control-center_0.1.3_amd64.changes` |

Install that local artifact with:

```bash
sudo apt install ./dist/g13-control-center_0.1.3_amd64.deb
```

Replace `amd64` with the value reported by
`dpkg-architecture -qDEB_HOST_ARCH` when building for another architecture.

### Standard Debian system build

A Debian build host with the declared `Build-Depends` installed can use the
regular packaging entry point from the source root:

```bash
dpkg-buildpackage --build=binary --no-sign
```

This performs normal build-dependency checking. As expected by standard Debian
builders, the final artifacts are placed one directory above the source tree:

| Contents | Standard location |
| --- | --- |
| Installable package | `../g13-control-center_0.1.3_amd64.deb` |
| Build information | `../g13-control-center_0.1.3_amd64.buildinfo` |
| Changes manifest | `../g13-control-center_0.1.3_amd64.changes` |

The Cargo output and temporary package filesystem remain at `build/` and
`debian/g13-control-center/` in both workflows. Distribution build systems may
set `DEB_BUILD_OPTIONS=nocheck` when their policy requires tests to run in a
separate stage.

### Source and installed paths

Both build workflows create the same package payload:

| Source-tree input | Installed package location |
| --- | --- |
| `src/*.js` | `/usr/share/g13-control-center/` |
| `data/g13-control-center` | `/usr/bin/g13-control-center` |
| `build/release/g13-keyboard-helper` | `/usr/libexec/g13-control-center-helper` |
| `modules-load.d/g13-control-center.conf` | `/usr/lib/modules-load.d/g13-control-center.conf` |
| `udev/70-g13-control-center.rules` | `/usr/lib/udev/rules.d/70-g13-control-center.rules` |
| Desktop metadata | `/usr/share/applications/` and `/usr/share/metainfo/` |
| D-Bus activation metadata | `/usr/share/dbus-1/services/` |
| systemd user unit | `/usr/lib/systemd/user/g13-control-center.service` |

### Rust helper structure

The helper remains one statically linked executable for packaging, but its
source is separated by responsibility:

```text
helper/src/
├── main.rs             # Process lifecycle and command routing
├── lib.rs              # Module declarations and shared error type
├── command.rs          # Command enum and FromStr parser
├── ioctl.rs            # Linux input ABI, structures, and ioctl wrappers
├── devices/
│   ├── mod.rs          # Shared VirtualDevice behavior and device utilities
│   ├── keyboard.rs     # Virtual keyboard and shared-key state
│   └── gamepad.rs      # Virtual gamepad and physical-input grab
└── utils/
    ├── mod.rs
    └── kernel.rs       # Kernel uinput diagnostics
```

This layout does not change the installed package: Cargo still builds
`g13-keyboard-helper`, which Debian installs as
`/usr/libexec/g13-control-center-helper`.

## Run from source

Build the virtual-keyboard helper, then start the application:

```bash
cargo build --release
./src/main.js
```

Launching G13 Control Center again presents the existing application window;
it does not start a second controller process. Closing the window hides it and
keeps mappings, device monitoring, and virtual input output active in the
background. Use the G13 icon in the desktop's upper bar to reopen **G13 Control
Center**, or choose **Exit** to stop the application completely. Desktop
environments that do not provide StatusNotifier support may require their usual
AppIndicator/status-tray extension.

The application version is displayed directly in the main window.

The device status panel detects the G13 gaming keypad and thumbstick independently from the
Linux input-device inventory. It refreshes automatically when the G13 is connected or removed.
The live input view mirrors the G-keys, mode and LCD buttons, thumb buttons, thumbstick click,
and analog thumbstick directions. Controls highlight while they are pressed. Click G1-G22,
Side, Lower, or the center thumbpad button to assign a persistent keyboard event. M1, M2,
and M3 select three independent mapping profiles; the active profile is highlighted and saved.

The thumbstick selector offers three persistent output modes. **Gamepad**
creates an analog gamepad with standard South, West, and East buttons for the
center, Side, and Lower controls. Its second selector sends movement through
either the standard left-stick X/Y axes or right-stick RX/RY axes. **WASD** and
**Arrows** convert stick directions into held keyboard events; diagonals hold
two keys together. The stick selector is disabled in those keyboard modes.
The color picker below the L-key row controls the shared LCD/key backlight
color, and the adjacent selector controls its brightness. The physical `*`
button is the G13's hardware backlight on/off toggle, so press it once if the
backlight status says it is off.

Mapped presses and thumbstick output are emitted by Rust-backed Linux uinput
devices. Because they appear as normal kernel keyboard and gamepad devices,
they work system-wide in GNOME and games under both X11 and Wayland while G13
Control Center is running. The helper releases held keys, buttons, and axes
during mode/profile changes and shutdown, supports normal key repeat, and
reconnects automatically if uinput is temporarily unavailable. While raw G13
monitoring is active, it exclusively captures the physical kernel thumbstick
device so a game receives only the selected virtual output instead of both
the physical and virtual joysticks.

## Developer troubleshooting: uinput

The Debian package performs these steps automatically. When running an
uninstalled development tree, developers can load uinput and temporarily
install the source-tree rule as a local administrator override:

```bash
sudo modprobe uinput
sudo modprobe joydev
sudo install -m 0644 udev/70-g13-control-center.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger --action=change --sysname-match=uinput
```

The application reports separate diagnostics when kernel uinput support is
disabled, the module is available but not loaded, `/dev/uinput` access is
denied, or creation of the virtual keyboard fails for another reason.

## Tests and coverage

Run the Rust and GJS test suites from the repository root:

```bash
cargo test --workspace --locked
./tests/run-coverage.sh
```

GitHub Actions runs these tests for pushes and pull requests. Its coverage gate
requires at least 80% line coverage of the testable GJS source. The **Tests**
badge at the top of this document reports that workflow's current result. The
**Builds** badge links to the workflow artifacts containing architecture-specific
Debian packages and the `.tar.gz` source archive; permanent release downloads
are linked by the **Downloads** badge.

## License

G13 Control Center is available under the [MIT License](LICENSE).
