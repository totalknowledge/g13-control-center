use std::collections::BTreeMap;
use std::fs::File;
use std::os::fd::AsRawFd;
use std::thread;
use std::time::Duration;

use super::{open_uinput, VirtualDevice};
use crate::ioctl::{
    call, call_int, call_ref, InputId, UInputSetup, BUS_VIRTUAL, EV_KEY, EV_REP, KEY_MAX_SUPPORTED,
    UI_DEV_CREATE, UI_DEV_DESTROY, UI_DEV_SETUP, UI_SET_EVBIT, UI_SET_KEYBIT,
};
use crate::Result;

#[derive(Default)]
struct KeyState {
    pressed: BTreeMap<u16, usize>,
}

impl KeyState {
    fn update(&mut self, code: u16, value: i32) -> Option<i32> {
        match value {
            1 => {
                let count = self.pressed.entry(code).or_default();
                *count += 1;
                (*count == 1).then_some(1)
            }
            0 => {
                let count = self.pressed.get_mut(&code)?;

                if *count > 1 {
                    *count -= 1;
                    None
                } else {
                    self.pressed.remove(&code);
                    Some(0)
                }
            }
            2 => self.pressed.contains_key(&code).then_some(2),
            _ => None,
        }
    }

    fn pressed_codes(&self) -> Vec<u16> {
        self.pressed.keys().copied().collect()
    }

    fn clear(&mut self) {
        self.pressed.clear();
    }
}

pub struct VirtualKeyboard {
    file: File,
    key_state: KeyState,
}

impl VirtualKeyboard {
    pub fn create() -> Result<Self> {
        let file = open_uinput()?;
        let fd = file.as_raw_fd();

        // SAFETY: These ioctls take integer values and operate on our open
        // uinput file descriptor.
        unsafe {
            call_int(fd, UI_SET_EVBIT, EV_KEY.into(), "enable EV_KEY")?;
            call_int(fd, UI_SET_EVBIT, EV_REP.into(), "enable EV_REP")?;

            for code in 1..=KEY_MAX_SUPPORTED {
                call_int(fd, UI_SET_KEYBIT, code, "enable keyboard key")?;
            }
        }

        let mut setup = UInputSetup {
            id: InputId {
                bustype: BUS_VIRTUAL,
                vendor: 0x046d,
                product: 0xc21c,
                version: 1,
            },
            ..UInputSetup::default()
        };
        let name = b"G13 Control Center Virtual Keyboard";
        setup.name[..name.len()].copy_from_slice(name);

        // SAFETY: UI_DEV_SETUP reads a correctly sized repr(C) structure and
        // UI_DEV_CREATE takes no additional argument.
        unsafe {
            call_ref(fd, UI_DEV_SETUP, &setup, "configure virtual keyboard")?;
            call(fd, UI_DEV_CREATE, "create virtual keyboard")?;
        }

        thread::sleep(Duration::from_millis(100));
        Ok(Self {
            file,
            key_state: KeyState::default(),
        })
    }

    pub fn emit(&mut self, code: u16, value: i32) -> Result<()> {
        let Some(output_value) = self.key_state.update(code, value) else {
            return Ok(());
        };

        self.write_event(EV_KEY, code, output_value)?;
        self.sync()
    }
}

impl VirtualDevice for VirtualKeyboard {
    fn file(&mut self) -> &mut File {
        &mut self.file
    }

    fn release_all(&mut self) -> Result<()> {
        let pressed_codes = self.key_state.pressed_codes();

        if pressed_codes.is_empty() {
            return Ok(());
        }

        for code in pressed_codes {
            self.write_event(EV_KEY, code, 0)?;
        }

        self.sync()?;
        self.key_state.clear();
        Ok(())
    }
}

impl Drop for VirtualKeyboard {
    fn drop(&mut self) {
        let _ = self.release_all();

        // SAFETY: UI_DEV_DESTROY takes no additional argument and the file
        // descriptor remains valid throughout drop.
        unsafe {
            let _ = call(
                self.file.as_raw_fd(),
                UI_DEV_DESTROY,
                "destroy virtual keyboard",
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::KeyState;

    #[test]
    fn holds_shared_mappings_until_every_control_releases() {
        let mut state = KeyState::default();

        assert_eq!(state.update(30, 1), Some(1));
        assert_eq!(state.update(30, 1), None);
        assert_eq!(state.update(30, 0), None);
        assert_eq!(state.update(30, 2), Some(2));
        assert_eq!(state.update(30, 0), Some(0));
        assert_eq!(state.update(30, 0), None);
        assert_eq!(state.update(30, 3), None);
    }
}
