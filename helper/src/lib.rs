pub mod command;
pub mod devices;
pub mod ioctl;
pub mod utils;

use std::error::Error;
use std::fmt;
use std::io;

#[derive(Debug)]
pub enum G13Error {
    Io(io::Error),
    InvalidCommand(String),
}

impl fmt::Display for G13Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => error.fmt(formatter),
            Self::InvalidCommand(message) => formatter.write_str(message),
        }
    }
}

impl Error for G13Error {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::InvalidCommand(_) => None,
        }
    }
}

impl From<io::Error> for G13Error {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

pub type Result<T> = std::result::Result<T, G13Error>;
