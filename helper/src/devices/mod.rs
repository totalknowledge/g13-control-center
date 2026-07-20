pub mod gamepad;
pub mod keyboard;

use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::os::fd::AsRawFd;

use crate::ioctl::{
    bytes_of, call_mut, call_mut_result, hid_feature_request, HidrawDevInfo, InputEvent, TimeVal,
    EV_SYN, G13_BACKLIGHT_REPORT_ID, G13_PRODUCT_ID, G13_VENDOR_ID, HIDIOCGRAWINFO, SYN_REPORT,
};
use crate::utils::kernel::missing_uinput_error;
use crate::Result;

pub trait VirtualDevice {
    fn file(&mut self) -> &mut File;
    fn release_all(&mut self) -> Result<()>;

    fn write_event(&mut self, event_type: u16, code: u16, value: i32) -> Result<()> {
        let event = InputEvent {
            time: TimeVal {
                seconds: 0,
                microseconds: 0,
            },
            event_type,
            code,
            value,
        };
        self.file().write_all(bytes_of(&event))?;
        Ok(())
    }

    fn sync(&mut self) -> Result<()> {
        self.write_event(EV_SYN, SYN_REPORT, 0)?;
        self.file().flush()?;
        Ok(())
    }
}

pub(crate) fn open_uinput() -> io::Result<File> {
    let mut permission_denied = false;
    let mut other_error = None;

    for path in ["/dev/uinput", "/dev/input/uinput"] {
        match OpenOptions::new().read(true).write(true).open(path) {
            Ok(file) => return Ok(file),
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                permission_denied = true;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => other_error = Some(error),
        }
    }

    if permission_denied {
        Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "uinput device exists but access is denied; verify the packaged udev rule and active desktop session",
        ))
    } else if let Some(error) = other_error {
        Err(io::Error::new(
            error.kind(),
            format!("unable to open uinput device: {error}"),
        ))
    } else {
        Err(missing_uinput_error())
    }
}

pub fn is_hidraw_path(path: &str) -> bool {
    path.strip_prefix("/dev/hidraw").is_some_and(|suffix| {
        !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
    })
}

pub fn is_input_event_path(path: &str) -> bool {
    path.strip_prefix("/dev/input/event").is_some_and(|suffix| {
        !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
    })
}

#[allow(clippy::io_other_error)] // Keep compatibility with the declared Rust 1.70 minimum.
fn other_error(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::Other, message)
}

pub fn set_g13_lighting(path: &str, red: u8, green: u8, blue: u8, brightness: u8) -> Result<()> {
    let file = OpenOptions::new().read(true).write(true).open(path)?;
    let fd = file.as_raw_fd();
    let mut info = HidrawDevInfo::default();

    // SAFETY: HIDIOCGRAWINFO writes a correctly sized repr(C) structure.
    unsafe {
        call_mut(fd, HIDIOCGRAWINFO, &mut info, "identify hidraw device")?;
    }

    if info.vendor as u16 != G13_VENDOR_ID || info.product as u16 != G13_PRODUCT_ID {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "refusing to change lighting on a non-G13 hidraw device",
        )
        .into());
    }

    let scale = |component: u8| -> u8 {
        ((u16::from(component) * u16::from(brightness) + 127) / 255) as u8
    };
    let mut report = [
        G13_BACKLIGHT_REPORT_ID,
        scale(red),
        scale(green),
        scale(blue),
        0,
    ];

    // SAFETY: HIDIOCSFEATURE reads report.len() bytes from this feature-report
    // buffer; byte zero contains the report ID.
    let result = unsafe {
        call_mut_result(
            fd,
            hid_feature_request(report.len()),
            &mut report,
            "set G13 lighting",
        )?
    };

    if result as usize != report.len() {
        return Err(other_error(format!("set G13 lighting returned {result} bytes")).into());
    }

    Ok(())
}
