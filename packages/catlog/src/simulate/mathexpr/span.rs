use super::pprint;
use std::fmt::{self, Formatter};

pub type ByteOffset = usize;
pub type ByteLength = usize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    start: ByteOffset,
    length: ByteLength,
}

struct SpanPrinter<'a, 'b> {
    writer: &'a mut Formatter<'b>,
    line_number_width: usize,
}

impl<'a, 'b> SpanPrinter<'a, 'b> {
    fn new(w: &'a mut Formatter<'b>, src: &str) -> Self {
        let lnw = (src.lines().count() as f64).log10().floor() as usize + 1;
        SpanPrinter {
            writer: w,
            line_number_width: lnw,
        }
    }

    fn spaces(&mut self, n: usize) -> fmt::Result {
        pprint::spaces(self.writer, n)
    }

    fn carets(&mut self, n: usize) -> fmt::Result {
        writeln!(&mut self.writer, "{:^<n$}", "")
    }

    fn source_line(&mut self, i: usize, line: &str) -> fmt::Result {
        writeln!(&mut self.writer, "{n:lnw$} | {}", line, n = i + 1, lnw = self.line_number_width)
    }

    fn err_line_start(&mut self) -> fmt::Result {
        write!(&mut self.writer, "{:lnw$} | ", "", lnw = self.line_number_width)
    }
}

impl Span {
    pub fn new(start: ByteOffset, length: ByteLength) -> Self {
        Self { start, length }
    }

    pub fn len(&self) -> ByteLength {
        self.length
    }

    pub fn start(&self) -> ByteOffset {
        self.start
    }

    pub fn end(&self) -> ByteOffset {
        self.start() + self.len()
    }

    pub fn slice<'a>(&self, src: &'a str) -> &'a str {
        &src[self.start()..self.end()]
    }
}

impl pprint::DisplayWithSource for Span {
    fn fmt(&self, src: &str, f: &mut Formatter) -> fmt::Result {
        let mut b = 0;
        let s = self.start();
        let e = self.start() + self.len();
        // line number width
        let mut p = SpanPrinter::new(f, src);
        let mut started_printing = false;
        for (i, line) in src.lines().enumerate() {
            if !started_printing {
                let mut first_char = None;
                let mut last_char = None;
                for (j, c) in line.chars().enumerate() {
                    if b == s {
                        first_char = Some(j)
                    }
                    if b == e {
                        last_char = Some(j);
                    }
                    b += c.len_utf8()
                }
                if b == e {
                    last_char = Some(line.chars().count());
                }
                if b >= src.len() && s >= b {
                    first_char = Some(line.chars().count());
                    last_char = Some(line.chars().count() + 1);
                }
                if let Some(c1) = first_char {
                    p.source_line(i, line)?;
                    p.err_line_start()?;
                    p.spaces(c1)?;
                    match last_char {
                        Some(c2) => {
                            p.carets(c2 - c1)?;
                            break;
                        }
                        None => {
                            p.carets(line.chars().count() - c1)?;
                            started_printing = true;
                        }
                    }
                }
            } else {
                let mut last_char = None;
                for (j, c) in line.chars().enumerate() {
                    if b == e {
                        last_char = Some(j);
                    }
                    b += c.len_utf8()
                }
                p.source_line(i, line)?;
                p.err_line_start()?;
                match last_char {
                    Some(c2) => {
                        p.carets(c2)?;
                        break;
                    }
                    None => {
                        p.carets(line.chars().count())?;
                    }
                }
            }
            b += '\n'.len_utf8();
        }
        Ok(())
    }
}

// #[cfg(test)]
// mod test {
//     use super::*;
//     use indoc::indoc;
//     use pprint::WithSource;

//     fn test_printing(span: Span, src: &str, compare: &str) {
//         assert_eq!(&format!("{}", WithSource::new(src, &span)), compare);
//     }

//     #[test]
//     fn single_line() {
//         test_printing(
//             Span::new(5, 3),
//             "hello world!",
//             indoc! {r#"
//                 1 | hello world!
//                   |      ^^^
//             "#},
//         );
//         test_printing(
//             Span::new(5, 10),
//             "hello world!",
//             indoc! {r#"
//                 1 | hello world!
//                   |      ^^^^^^^
//             "#},
//         );
//     }

//     #[test]
//     fn multi_line() {
//         test_printing(
//             Span::new(5, 10),
//             "hello world!\nprintln(\"foo\")",
//             indoc! {r#"
//                 1 | hello world!
//                   |      ^^^^^^^
//                 2 | println("foo")
//                   | ^^
//             "#},
//         );
//         test_printing(
//             Span::new(11, 2),
//             "\n\n\n\n\n\n\n\n\n\n\nhi\n\n",
//             indoc! {r#"
//                 12 | hi
//                    | ^^
//             "#},
//         );
//         test_printing(
//             Span::new(11, 4),
//             "\n\n\n\n\n\n\n\n\n\n\nhi\nhi\n",
//             indoc! {r#"
//                 12 | hi
//                    | ^^
//                 13 | hi
//                    | ^
//             "#},
//         );
//     }
// }
