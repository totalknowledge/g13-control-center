use std::fs;
use std::io;
use std::path::Path;

#[derive(Debug, Eq, PartialEq)]
enum KernelUInputSupport {
    BuiltIn,
    Module,
    Unsupported,
    Unknown,
}

fn parse_kernel_config(contents: &str) -> KernelUInputSupport {
    for line in contents.lines().map(str::trim) {
        match line {
            "CONFIG_INPUT_UINPUT=y" => return KernelUInputSupport::BuiltIn,
            "CONFIG_INPUT_UINPUT=m" => return KernelUInputSupport::Module,
            "# CONFIG_INPUT_UINPUT is not set" => return KernelUInputSupport::Unsupported,
            _ => {}
        }
    }

    KernelUInputSupport::Unknown
}

fn module_index_has_uinput(contents: &str) -> bool {
    contents.lines().any(|line| line.contains("/uinput.ko"))
}

pub(crate) fn missing_uinput_error() -> io::Error {
    if Path::new("/sys/module/uinput").exists()
        || fs::read_to_string("/proc/misc")
            .is_ok_and(|contents| contents.lines().any(|line| line.ends_with(" uinput")))
    {
        return io::Error::new(
            io::ErrorKind::NotFound,
            "uinput is active in the kernel, but its device node is missing",
        );
    }

    let release = fs::read_to_string("/proc/sys/kernel/osrelease")
        .unwrap_or_default()
        .trim()
        .to_string();
    let config = fs::read_to_string(format!("/boot/config-{release}"))
        .ok()
        .map(|contents| parse_kernel_config(&contents))
        .unwrap_or(KernelUInputSupport::Unknown);

    match config {
        KernelUInputSupport::Unsupported => {
            return io::Error::new(
                io::ErrorKind::Unsupported,
                "kernel has no uinput support (CONFIG_INPUT_UINPUT is disabled)",
            );
        }
        KernelUInputSupport::Module => {
            return io::Error::new(
                io::ErrorKind::NotFound,
                "uinput kernel module is installed but not loaded",
            );
        }
        KernelUInputSupport::BuiltIn => {
            return io::Error::new(
                io::ErrorKind::NotFound,
                "kernel has built-in uinput support, but its device node is missing",
            );
        }
        KernelUInputSupport::Unknown => {}
    }

    let module_root = format!("/lib/modules/{release}");

    for index in ["modules.dep", "modules.builtin"] {
        if fs::read_to_string(format!("{module_root}/{index}"))
            .is_ok_and(|contents| module_index_has_uinput(&contents))
        {
            return io::Error::new(
                io::ErrorKind::NotFound,
                "uinput kernel module is installed but not loaded",
            );
        }
    }

    io::Error::new(
        io::ErrorKind::NotFound,
        "uinput device is missing and kernel support could not be determined",
    )
}

#[cfg(test)]
mod tests {
    use super::{module_index_has_uinput, parse_kernel_config, KernelUInputSupport};

    #[test]
    fn diagnoses_kernel_uinput_configuration() {
        assert_eq!(
            parse_kernel_config("CONFIG_INPUT_UINPUT=m\n"),
            KernelUInputSupport::Module
        );
        assert_eq!(
            parse_kernel_config("CONFIG_INPUT_UINPUT=y\n"),
            KernelUInputSupport::BuiltIn
        );
        assert_eq!(
            parse_kernel_config("# CONFIG_INPUT_UINPUT is not set\n"),
            KernelUInputSupport::Unsupported
        );
        assert_eq!(
            parse_kernel_config("CONFIG_INPUT_MOUSE=y\n"),
            KernelUInputSupport::Unknown
        );
        assert!(module_index_has_uinput(
            "kernel/drivers/input/misc/uinput.ko.zst:\n"
        ));
        assert!(!module_index_has_uinput("kernel/drivers/input/mouse.ko:\n"));
    }
}
