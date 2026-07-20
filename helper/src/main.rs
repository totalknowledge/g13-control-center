use std::io::{self, BufRead, BufReader, Write};

use g13_keyboard_helper::command::Command;
use g13_keyboard_helper::devices::gamepad::{GrabbedInput, VirtualGamepad};
use g13_keyboard_helper::devices::keyboard::VirtualKeyboard;
use g13_keyboard_helper::devices::{set_g13_lighting, VirtualDevice};
use g13_keyboard_helper::Result;

fn run() -> Result<()> {
    let mut keyboard = VirtualKeyboard::create()?;
    let mut gamepad = match VirtualGamepad::create() {
        Ok(gamepad) => {
            println!("READY GAMEPAD");
            Some(gamepad)
        }
        Err(error) => {
            println!("READY KEYBOARD_ONLY {error}");
            None
        }
    };
    let mut grabbed_thumbstick: Option<GrabbedInput> = None;
    io::stdout().flush()?;

    for line in BufReader::new(io::stdin()).lines() {
        match line?.parse::<Command>() {
            Ok(Command::Key(code, value)) => keyboard.emit(code, value)?,
            Ok(Command::Axis(stick, x, y)) => {
                if let Some(gamepad) = gamepad.as_mut() {
                    gamepad.emit_axes(stick, x, y)?;
                }
            }
            Ok(Command::Button(index, pressed)) => {
                if let Some(gamepad) = gamepad.as_mut() {
                    gamepad.emit_button(index, pressed)?;
                }
            }
            Ok(Command::Light(path, red, green, blue, brightness)) => {
                if let Err(error) = set_g13_lighting(&path, red, green, blue, brightness) {
                    eprintln!("Unable to set G13 lighting: {error}");
                }
            }
            Ok(Command::Grab(path)) => {
                if grabbed_thumbstick
                    .as_ref()
                    .is_some_and(|grab| grab.path == path)
                {
                    continue;
                }

                grabbed_thumbstick = None;
                match GrabbedInput::create(&path) {
                    Ok(grab) => grabbed_thumbstick = Some(grab),
                    Err(error) => eprintln!("Unable to grab physical G13 thumbstick: {error}"),
                }
            }
            Ok(Command::Ungrab) => grabbed_thumbstick = None,
            Ok(Command::Quit) => break,
            Err(error) => eprintln!("Ignoring command: {error}"),
        }
    }

    if let Some(gamepad) = gamepad.as_mut() {
        gamepad.release_all()?;
    }
    keyboard.release_all()?;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
