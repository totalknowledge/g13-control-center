use std::fs::{File, OpenOptions};
use std::io;
use std::os::fd::AsRawFd;
use std::thread;
use std::time::Duration;

use super::{is_input_event_path, open_uinput, VirtualDevice};
use crate::ioctl::{
    call, call_int, call_mut, call_ref, evdev_name_request, InputAbsInfo, InputId, UInputAbsSetup,
    UInputSetup, BUS_VIRTUAL, EVIOCGID, EVIOCGRAB, EV_ABS, EV_KEY, G13_PRODUCT_ID, G13_VENDOR_ID,
    GAMEPAD_AXES, GAMEPAD_BUTTONS, UI_ABS_SETUP, UI_DEV_CREATE, UI_DEV_DESTROY, UI_DEV_SETUP,
    UI_SET_ABSBIT, UI_SET_EVBIT, UI_SET_KEYBIT,
};
use crate::Result;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GamepadStick {
    Left,
    Right,
}

pub struct VirtualGamepad {
    file: File,
    axes: [i32; 4],
    buttons: [bool; 3],
}

impl VirtualGamepad {
    pub fn create() -> Result<Self> {
        let file = open_uinput()?;
        let fd = file.as_raw_fd();

        // SAFETY: These ioctls take integer values and operate on our open
        // uinput file descriptor.
        unsafe {
            call_int(fd, UI_SET_EVBIT, EV_KEY.into(), "enable EV_KEY")?;
            call_int(fd, UI_SET_EVBIT, EV_ABS.into(), "enable EV_ABS")?;

            for code in GAMEPAD_BUTTONS {
                call_int(fd, UI_SET_KEYBIT, code.into(), "enable gamepad button")?;
            }

            for code in GAMEPAD_AXES {
                call_int(fd, UI_SET_ABSBIT, code.into(), "enable gamepad axis")?;
                let axis = UInputAbsSetup {
                    code,
                    padding: 0,
                    absinfo: InputAbsInfo {
                        minimum: -32768,
                        maximum: 32767,
                        fuzz: 256,
                        flat: 4096,
                        ..InputAbsInfo::default()
                    },
                };
                call_ref(fd, UI_ABS_SETUP, &axis, "configure gamepad axis")?;
            }
        }

        let mut setup = UInputSetup {
            id: InputId {
                bustype: BUS_VIRTUAL,
                vendor: G13_VENDOR_ID,
                product: G13_PRODUCT_ID,
                version: 3,
            },
            ..UInputSetup::default()
        };
        let name = b"G13 Control Center Virtual Gamepad";
        setup.name[..name.len()].copy_from_slice(name);

        // SAFETY: UI_DEV_SETUP reads a correctly sized repr(C) structure and
        // UI_DEV_CREATE takes no additional argument.
        unsafe {
            call_ref(fd, UI_DEV_SETUP, &setup, "configure virtual gamepad")?;
            call(fd, UI_DEV_CREATE, "create virtual gamepad")?;
        }

        thread::sleep(Duration::from_millis(100));
        Ok(Self {
            file,
            axes: [0; 4],
            buttons: [false; 3],
        })
    }

    pub fn emit_axes(&mut self, stick: GamepadStick, x: i32, y: i32) -> Result<()> {
        let next = match stick {
            GamepadStick::Left => [x, y, 0, 0],
            GamepadStick::Right => [0, 0, x, y],
        };
        let mut changed = false;

        for (index, code) in GAMEPAD_AXES.iter().enumerate() {
            if self.axes[index] != next[index] {
                self.write_event(EV_ABS, *code, next[index])?;
                self.axes[index] = next[index];
                changed = true;
            }
        }

        if changed {
            self.sync()?;
        }

        Ok(())
    }

    pub fn emit_button(&mut self, index: usize, pressed: bool) -> Result<()> {
        if self.buttons[index] == pressed {
            return Ok(());
        }

        self.write_event(EV_KEY, GAMEPAD_BUTTONS[index], i32::from(pressed))?;
        self.buttons[index] = pressed;
        self.sync()
    }
}

impl VirtualDevice for VirtualGamepad {
    fn file(&mut self) -> &mut File {
        &mut self.file
    }

    fn release_all(&mut self) -> Result<()> {
        let mut changed = false;

        for (index, code) in GAMEPAD_BUTTONS.iter().enumerate() {
            if self.buttons[index] {
                self.write_event(EV_KEY, *code, 0)?;
                self.buttons[index] = false;
                changed = true;
            }
        }

        for (index, code) in GAMEPAD_AXES.iter().enumerate() {
            if self.axes[index] != 0 {
                self.write_event(EV_ABS, *code, 0)?;
                self.axes[index] = 0;
                changed = true;
            }
        }

        if changed {
            self.sync()?;
        }

        Ok(())
    }
}

impl Drop for VirtualGamepad {
    fn drop(&mut self) {
        let _ = self.release_all();

        // SAFETY: UI_DEV_DESTROY takes no additional argument and the file
        // descriptor remains valid throughout drop.
        unsafe {
            let _ = call(
                self.file.as_raw_fd(),
                UI_DEV_DESTROY,
                "destroy virtual gamepad",
            );
        }
    }
}

pub struct GrabbedInput {
    file: File,
    pub path: String,
}

impl GrabbedInput {
    pub fn create(path: &str) -> Result<Self> {
        if !is_input_event_path(path) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "unsupported input-event path",
            )
            .into());
        }

        let file = OpenOptions::new().read(true).open(path)?;
        let fd = file.as_raw_fd();
        let mut id = InputId::default();
        let mut name = [0_u8; 128];

        // SAFETY: EVIOCGID and EVIOCGNAME write into correctly sized buffers,
        // and EVIOCGRAB takes an integer flag.
        unsafe {
            call_mut(fd, EVIOCGID, &mut id, "identify physical thumbstick")?;
            call_mut(
                fd,
                evdev_name_request(name.len()),
                &mut name,
                "read physical thumbstick name",
            )?;
        }

        let name_end = name
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(name.len());
        let input_name = String::from_utf8_lossy(&name[..name_end]);

        if id.vendor != G13_VENDOR_ID
            || id.product != G13_PRODUCT_ID
            || !input_name.contains("G13 Thumbstick")
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "refusing to grab a non-G13 thumbstick device",
            )
            .into());
        }

        // SAFETY: The device was validated above and EVIOCGRAB takes an
        // integer flag. Closing the descriptor also releases the grab.
        unsafe {
            call_int(fd, EVIOCGRAB, 1, "grab physical thumbstick")?;
        }

        Ok(Self {
            file,
            path: path.to_string(),
        })
    }
}

impl Drop for GrabbedInput {
    fn drop(&mut self) {
        // SAFETY: EVIOCGRAB takes an integer flag and the descriptor is still
        // open for the duration of drop.
        unsafe {
            let _ = call_int(
                self.file.as_raw_fd(),
                EVIOCGRAB,
                0,
                "release physical thumbstick",
            );
        }
    }
}
