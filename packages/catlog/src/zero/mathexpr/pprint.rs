use std::fmt;

pub(super) trait DisplayWithSource {
    fn fmt(&self, src: &str, f: &mut fmt::Formatter) -> fmt::Result;
}

pub(super) struct WithSource<'a, 'b, T: DisplayWithSource> {
    pub src: &'a str,
    pub value: &'b T,
}

impl<'a, 'b, T: DisplayWithSource> WithSource<'a, 'b, T> {
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
