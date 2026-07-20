use std::ffi::{c_int, c_ulong};
use std::io;
use std::mem::size_of;
use std::os::fd::RawFd;
use std::slice;

pub(crate) const EV_SYN: u16 = 0;
pub(crate) const EV_KEY: u16 = 1;
pub(crate) const EV_ABS: u16 = 3;
pub(crate) const EV_REP: u16 = 0x14;
pub(crate) const SYN_REPORT: u16 = 0;
pub(crate) const ABS_X: u16 = 0;
pub(crate) const ABS_Y: u16 = 1;
pub(crate) const ABS_RX: u16 = 3;
pub(crate) const ABS_RY: u16 = 4;
pub(crate) const GAMEPAD_AXES: [u16; 4] = [ABS_X, ABS_Y, ABS_RX, ABS_RY];
pub(crate) const BTN_SOUTH: u16 = 0x130;
pub(crate) const BTN_EAST: u16 = 0x131;
pub(crate) const BTN_WEST: u16 = 0x134;
pub const GAMEPAD_BUTTONS: [u16; 3] = [BTN_SOUTH, BTN_WEST, BTN_EAST];
pub(crate) const BUS_VIRTUAL: u16 = 0x06;
pub const KEY_MAX_SUPPORTED: i32 = 255;
pub(crate) const G13_VENDOR_ID: u16 = 0x046d;
pub(crate) const G13_PRODUCT_ID: u16 = 0xc21c;
pub(crate) const G13_BACKLIGHT_REPORT_ID: u8 = 0x07;

const UINPUT_IOCTL_BASE: u64 = b'U' as u64;
const HIDRAW_IOCTL_BASE: u64 = b'H' as u64;
const EVDEV_IOCTL_BASE: u64 = b'E' as u64;
const IOC_READ: u64 = 2;
const IOC_WRITE: u64 = 1;
const IOC_DIRSHIFT: u64 = 30;
const IOC_SIZESHIFT: u64 = 16;
const IOC_TYPESHIFT: u64 = 8;

const fn request_none(kind: u64, number: u64) -> c_ulong {
    ((kind << IOC_TYPESHIFT) | number) as c_ulong
}

pub(crate) const fn request_write(kind: u64, number: u64, size: usize) -> c_ulong {
    ((IOC_WRITE << IOC_DIRSHIFT)
        | ((size as u64) << IOC_SIZESHIFT)
        | (kind << IOC_TYPESHIFT)
        | number) as c_ulong
}

pub(crate) const fn request_read(kind: u64, number: u64, size: usize) -> c_ulong {
    ((IOC_READ << IOC_DIRSHIFT)
        | ((size as u64) << IOC_SIZESHIFT)
        | (kind << IOC_TYPESHIFT)
        | number) as c_ulong
}

const fn request_read_write(kind: u64, number: u64, size: usize) -> c_ulong {
    (((IOC_READ | IOC_WRITE) << IOC_DIRSHIFT)
        | ((size as u64) << IOC_SIZESHIFT)
        | (kind << IOC_TYPESHIFT)
        | number) as c_ulong
}

pub(crate) const UI_DEV_CREATE: c_ulong = request_none(UINPUT_IOCTL_BASE, 1);
pub(crate) const UI_DEV_DESTROY: c_ulong = request_none(UINPUT_IOCTL_BASE, 2);
pub(crate) const UI_SET_EVBIT: c_ulong = request_write(UINPUT_IOCTL_BASE, 100, size_of::<c_int>());
pub(crate) const UI_SET_KEYBIT: c_ulong = request_write(UINPUT_IOCTL_BASE, 101, size_of::<c_int>());
pub(crate) const UI_SET_ABSBIT: c_ulong = request_write(UINPUT_IOCTL_BASE, 103, size_of::<c_int>());
pub(crate) const UI_DEV_SETUP: c_ulong =
    request_write(UINPUT_IOCTL_BASE, 3, size_of::<UInputSetup>());
pub(crate) const UI_ABS_SETUP: c_ulong =
    request_write(UINPUT_IOCTL_BASE, 4, size_of::<UInputAbsSetup>());
pub(crate) const HIDIOCGRAWINFO: c_ulong =
    request_read(HIDRAW_IOCTL_BASE, 0x03, size_of::<HidrawDevInfo>());
pub(crate) const EVIOCGID: c_ulong = request_read(EVDEV_IOCTL_BASE, 0x02, size_of::<InputId>());
pub(crate) const EVIOCGRAB: c_ulong = request_write(EVDEV_IOCTL_BASE, 0x90, size_of::<c_int>());

pub(crate) fn evdev_name_request(size: usize) -> c_ulong {
    request_read(EVDEV_IOCTL_BASE, 0x06, size)
}

pub(crate) fn hid_feature_request(size: usize) -> c_ulong {
    request_read_write(HIDRAW_IOCTL_BASE, 0x06, size)
}

unsafe extern "C" {
    fn ioctl(fd: c_int, request: c_ulong, ...) -> c_int;
}

#[repr(C)]
#[derive(Default)]
pub(crate) struct InputId {
    pub(crate) bustype: u16,
    pub(crate) vendor: u16,
    pub(crate) product: u16,
    pub(crate) version: u16,
}

#[repr(C)]
pub(crate) struct UInputSetup {
    pub(crate) id: InputId,
    pub(crate) name: [u8; 80],
    pub(crate) ff_effects_max: u32,
}

impl Default for UInputSetup {
    fn default() -> Self {
        Self {
            id: InputId::default(),
            name: [0; 80],
            ff_effects_max: 0,
        }
    }
}

#[repr(C)]
#[derive(Default)]
pub(crate) struct InputAbsInfo {
    pub(crate) value: i32,
    pub(crate) minimum: i32,
    pub(crate) maximum: i32,
    pub(crate) fuzz: i32,
    pub(crate) flat: i32,
    pub(crate) resolution: i32,
}

#[repr(C)]
#[derive(Default)]
pub(crate) struct UInputAbsSetup {
    pub(crate) code: u16,
    pub(crate) padding: u16,
    pub(crate) absinfo: InputAbsInfo,
}

#[repr(C)]
#[derive(Default)]
pub(crate) struct HidrawDevInfo {
    pub(crate) bustype: u32,
    pub(crate) vendor: i16,
    pub(crate) product: i16,
}

#[repr(C)]
pub(crate) struct TimeVal {
    pub(crate) seconds: isize,
    pub(crate) microseconds: isize,
}

#[repr(C)]
pub(crate) struct InputEvent {
    pub(crate) time: TimeVal,
    pub(crate) event_type: u16,
    pub(crate) code: u16,
    pub(crate) value: i32,
}

pub(crate) fn bytes_of<T>(value: &T) -> &[u8] {
    // SAFETY: The returned slice is read-only and has the exact size and
    // lifetime of the referenced repr(C) value.
    unsafe { slice::from_raw_parts((value as *const T).cast::<u8>(), size_of::<T>()) }
}

fn ioctl_result(result: c_int, operation: &str) -> io::Result<()> {
    if result >= 0 {
        return Ok(());
    }

    let error = io::Error::last_os_error();
    Err(io::Error::new(
        error.kind(),
        format!("{operation}: {error}"),
    ))
}

pub(crate) unsafe fn call(fd: RawFd, request: c_ulong, operation: &str) -> io::Result<()> {
    ioctl_result(unsafe { ioctl(fd, request) }, operation)
}

pub(crate) unsafe fn call_int(
    fd: RawFd,
    request: c_ulong,
    value: c_int,
    operation: &str,
) -> io::Result<()> {
    ioctl_result(unsafe { ioctl(fd, request, value) }, operation)
}

pub(crate) unsafe fn call_ref<T>(
    fd: RawFd,
    request: c_ulong,
    value: &T,
    operation: &str,
) -> io::Result<()> {
    ioctl_result(unsafe { ioctl(fd, request, value as *const T) }, operation)
}

pub(crate) unsafe fn call_mut<T>(
    fd: RawFd,
    request: c_ulong,
    value: &mut T,
    operation: &str,
) -> io::Result<()> {
    ioctl_result(unsafe { ioctl(fd, request, value as *mut T) }, operation)
}

pub(crate) unsafe fn call_mut_result<T>(
    fd: RawFd,
    request: c_ulong,
    value: &mut T,
    operation: &str,
) -> io::Result<c_int> {
    let result = unsafe { ioctl(fd, request, value as *mut T) };
    ioctl_result(result, operation)?;
    Ok(result)
}
