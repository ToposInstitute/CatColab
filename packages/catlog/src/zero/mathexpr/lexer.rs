use super::error::{Error, Errors};
use super::span::{self, Span};
use super::token::{self, Kind, Token};

fn is_ident_start(c: char) -> bool {
    c.is_alphabetic()
}

fn is_ident_continue(c: char) -> bool {
    c.is_alphanumeric()
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
                    self.error(Error {
                        span: Span::new(self.last_pos, c.len_utf8()),
                        description: super::error::Description::UnexpectedStartOfToken,
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

pub(super) fn lex(s: &str) -> Result<Vec<Token>, Errors> {
    let mut l = Lexer::new(s);
    l.run();
    if !l.errors.is_empty() {
        Err(Errors(l.errors))
    } else {
        Ok(l.out)
    }
}
