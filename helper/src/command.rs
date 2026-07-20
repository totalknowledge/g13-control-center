use std::str::FromStr;

use crate::devices::gamepad::GamepadStick;
use crate::devices::{is_hidraw_path, is_input_event_path};
use crate::ioctl::{GAMEPAD_BUTTONS, KEY_MAX_SUPPORTED};
use crate::{G13Error, Result};

#[derive(Debug, Eq, PartialEq)]
pub enum Command {
    Key(u16, i32),
    Axis(GamepadStick, i32, i32),
    Button(usize, bool),
    Light(String, u8, u8, u8, u8),
    Grab(String),
    Ungrab,
    Quit,
}

fn invalid(message: impl Into<String>) -> G13Error {
    G13Error::InvalidCommand(message.into())
}

fn parse_number<T: FromStr>(value: Option<&str>, name: &str) -> Result<T> {
    value
        .ok_or_else(|| invalid(format!("missing {name}")))?
        .parse::<T>()
        .map_err(|_| invalid(format!("invalid {name}")))
}

impl FromStr for Command {
    type Err = G13Error;

    fn from_str(line: &str) -> Result<Self> {
        let trimmed = line.trim();

        if trimmed == "quit" {
            return Ok(Self::Quit);
        }

        let mut parts = trimmed.split_whitespace();
        let operation = parts.next().ok_or_else(|| invalid("missing command"))?;

        match operation {
            "axis" => {
                let selector = parts
                    .next()
                    .ok_or_else(|| invalid("missing stick or X axis"))?;
                let (stick, x) = match selector {
                    "left" => (GamepadStick::Left, parse_number(parts.next(), "X axis")?),
                    "right" => (GamepadStick::Right, parse_number(parts.next(), "X axis")?),
                    _ => (
                        GamepadStick::Left,
                        selector
                            .parse::<i32>()
                            .map_err(|_| invalid("invalid stick or X axis"))?,
                    ),
                };
                let y = parse_number(parts.next(), "Y axis")?;

                if parts.next().is_some()
                    || !(-32768..=32767).contains(&x)
                    || !(-32768..=32767).contains(&y)
                {
                    return Err(invalid("axis values must be between -32768 and 32767"));
                }

                Ok(Self::Axis(stick, x, y))
            }
            "button" => {
                let index = parse_number(parts.next(), "button index")?;
                let value: i32 = parse_number(parts.next(), "button value")?;

                if parts.next().is_some() || index >= GAMEPAD_BUTTONS.len() {
                    return Err(invalid("gamepad button index must be 0, 1, or 2"));
                }

                if !matches!(value, 0..=1) {
                    return Err(invalid("gamepad button value must be 0 or 1"));
                }

                Ok(Self::Button(index, value == 1))
            }
            "light" => {
                let path = parts.next().ok_or_else(|| invalid("missing hidraw path"))?;
                let red = parse_number(parts.next(), "red value")?;
                let green = parse_number(parts.next(), "green value")?;
                let blue = parse_number(parts.next(), "blue value")?;
                let brightness = parse_number(parts.next(), "brightness")?;

                if parts.next().is_some() || !is_hidraw_path(path) {
                    return Err(invalid("unsupported lighting command"));
                }

                Ok(Self::Light(path.to_string(), red, green, blue, brightness))
            }
            "grab" => {
                let path = parts
                    .next()
                    .ok_or_else(|| invalid("missing input-event path"))?;

                if parts.next().is_some() || !is_input_event_path(path) {
                    return Err(invalid("unsupported grab command"));
                }

                Ok(Self::Grab(path.to_string()))
            }
            "ungrab" => {
                if parts.next().is_some() {
                    return Err(invalid("unsupported ungrab command"));
                }

                Ok(Self::Ungrab)
            }
            _ => {
                // Preserve the 0.1.0 keyboard protocol: "<code> <value>".
                let code = operation
                    .parse::<u16>()
                    .map_err(|_| invalid("invalid key code"))?;
                let value = parse_number(parts.next(), "key value")?;

                if parts.next().is_some() || code == 0 || code > KEY_MAX_SUPPORTED as u16 {
                    return Err(invalid("unsupported key command"));
                }

                if !matches!(value, 0..=2) {
                    return Err(invalid("key value must be 0, 1, or 2"));
                }

                Ok(Self::Key(code, value))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Command;
    use crate::devices::gamepad::GamepadStick;
    use crate::devices::{is_hidraw_path, is_input_event_path};

    fn parse(command: &str) -> Command {
        command.parse().unwrap()
    }

    #[test]
    fn parses_key_commands() {
        assert_eq!(parse("30 1"), Command::Key(30, 1));
        assert_eq!(parse("30 0"), Command::Key(30, 0));
        assert_eq!(parse("quit"), Command::Quit);
    }

    #[test]
    fn parses_gamepad_and_lighting_commands() {
        assert_eq!(
            parse("axis -32768 32767"),
            Command::Axis(GamepadStick::Left, -32768, 32767)
        );
        assert_eq!(
            parse("axis right -32768 32767"),
            Command::Axis(GamepadStick::Right, -32768, 32767)
        );
        assert_eq!(parse("button 2 1"), Command::Button(2, true));
        assert_eq!(
            parse("light /dev/hidraw3 90 255 110 192"),
            Command::Light("/dev/hidraw3".to_string(), 90, 255, 110, 192),
        );
        assert!(is_hidraw_path("/dev/hidraw0"));
        assert!(!is_hidraw_path("/tmp/hidraw0"));
        assert_eq!(
            parse("grab /dev/input/event9"),
            Command::Grab("/dev/input/event9".to_string()),
        );
        assert_eq!(parse("ungrab"), Command::Ungrab);
        assert!(is_input_event_path("/dev/input/event9"));
        assert!(!is_input_event_path("/tmp/event9"));
    }

    #[test]
    fn rejects_invalid_commands() {
        for command in [
            "0 1",
            "30 3",
            "axis -32769 0",
            "axis middle 0 0",
            "button 3 1",
            "light /dev/hidrawX 1 2 3 4",
            "grab /dev/input/mouse0",
            "hello",
        ] {
            assert!(command.parse::<Command>().is_err(), "accepted {command}");
        }
    }
}
