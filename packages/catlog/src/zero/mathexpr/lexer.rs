use super::pprint::*;
use super::span::{self, Span};
use super::token::{self, Kind, Token};
use std::fmt;

fn is_ident_start(c: char) -> bool {
    c.is_alphabetic()
}

fn is_ident_continue(c: char) -> bool {
    c.is_alphanumeric()
}

#[derive(Debug)]
pub(super) enum Error {
    UnexpectedStartOfToken { location: Span },
}

impl DisplayWithSource for Error {
    fn fmt(&self, src: &str, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Error::UnexpectedStartOfToken { location } => {
                writeln!(f, "lex error: unexpected start of token\n")?;
                write!(f, "{}", WithSource::new(src, location))?;
            }
        };
        Ok(())
    }
}

struct Lexer<'a> {
    out: Vec<Token>,
    iter: std::iter::Peekable<std::str::Chars<'a>>,
    current_pos: span::ByteOffset,
    last_pos: span::ByteOffset,
    errors: Vec<Error>,
}

impl<'a> Lexer<'a> {
    fn new(s: &'a str) -> Self {
        Lexer {
            out: Vec::new(),
            iter: s.chars().peekable(),
            current_pos: 0,
            last_pos: 0,
            errors: Vec::new(),
        }
    }

    fn next(&mut self) -> Option<char> {
        self.iter.next().map(|c| {
            self.current_pos += c.len_utf8();
            c
        })
    }

    fn peek(&mut self) -> Option<char> {
        self.iter.peek().copied()
    }

    fn emit(&mut self, kind: Kind) {
        self.out
            .push(Token::new(kind, Span::new(self.last_pos, self.current_pos - self.last_pos)));
        self.last_pos = self.current_pos;
    }

    fn skip(&mut self) {
        self.last_pos = self.current_pos;
    }

    fn error(&mut self, error: Error) {
        self.errors.push(error);
        self.emit(token::Error);
    }

    pub fn run(&mut self) {
        while let Some(c) = self.next() {
            match c {
                '(' => self.emit(token::LParen),
                ')' => self.emit(token::RParen),
                '+' => self.emit(token::Plus),
                '*' => self.emit(token::Times),
                '-' => self.emit(token::Minus),
                '/' => self.emit(token::Slash),
                '0'..='9' => self.number(),
                ' ' | '\n' | '\t' => self.whitespace(),
                _ if is_ident_start(c) => self.ident(),
                _ => {
                    self.error(Error::UnexpectedStartOfToken {
                        location: Span::new(self.last_pos, c.len_utf8()),
                    });
                }
            }
        }
    }

    fn ident(&mut self) {
        while let Some(c) = self.peek() {
            match c {
                _ if is_ident_continue(c) => {
                    self.next();
                }
                _ => {
                    break;
                }
            }
        }
        self.emit(token::Ident);
    }

    fn whitespace(&mut self) {
        while let Some(c) = self.peek() {
            match c {
                ' ' | '\n' | '\t' => {
                    self.next();
                }
                _ => break,
            }
        }
        self.skip();
    }

    fn decimal(&mut self) {
        while let Some(c) = self.peek() {
            match c {
                '0'..='9' => {
                    self.next();
                }
                _ => {
                    break;
                }
            }
        }
        self.emit(token::Decimal);
    }

    fn number(&mut self) {
        while let Some(c) = self.peek() {
            match c {
                '0'..='9' => {
                    self.next();
                }
                '.' => {
                    self.next();
                    self.decimal();
                    return;
                }
                _ => {
                    break;
                }
            }
        }
        self.emit(token::Decimal);
    }
}

pub struct Lexed {
    pub tokens: Vec<Token>,
    pub errors: Vec<Error>,
}

impl fmt::Display for Lexed {
    fn fmt(&self, f: &mut fmt::Formatter) -> Result<(), fmt::Error> {
        let mut iter = self.tokens.iter();
        if let Some(t) = iter.next() {
            write!(f, "{}", t)?;
        }
        for t in iter {
            write!(f, " {}", t)?;
        }
        Ok(())
    }
}

pub(super) fn lex(s: &str) -> Lexed {
    let mut l = Lexer::new(s);
    l.run();
    Lexed {
        tokens: l.out,
        errors: l.errors,
    }
}
