use std::fmt;

pub trait DisplayWithSource {
    fn fmt(&self, src: &str, f: &mut fmt::Formatter) -> fmt::Result;
}

/// A wrapper around a value that can be displayed via DisplayWithSource
/// that implements Display, so that one can write
///
/// ```rust
/// write!(f, "{}", WithSource::new(src, &a))
/// ```
pub struct WithSource<'a, 'b, T: DisplayWithSource> {
    src: &'a str,
    value: &'b T,
}

impl<'a, 'b, T: DisplayWithSource> WithSource<'a, 'b, T> {
    /// Returns a new WithSource wrapper
    pub fn new(src: &'a str, value: &'b T) -> Self {
        Self { src, value }
    }
}

impl<'a, 'b, T> fmt::Display for WithSource<'a, 'b, T>
where
    T: DisplayWithSource,
{
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        self.value.fmt(self.src, f)
    }
}

pub(super) fn spaces(f: &mut fmt::Formatter, n: usize) -> fmt::Result {
    write!(f, "{:n$}", "")
}
