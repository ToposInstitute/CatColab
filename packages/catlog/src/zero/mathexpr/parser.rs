use ustr::ustr;

use super::error::{Description, Error, Errors};
use super::lexer;
use super::span::Span;
use super::syntax::*;
use super::token::{self, Token};
use std::cell::Cell;

pub struct Parser<'a> {
    source: &'a str,
    tokens: &'a [Token],
    pos: usize,
    fuel: Cell<u32>,
}

impl<'a> Parser<'a> {
    pub fn new(source: &'a str, tokens: &'a [Token]) -> Self {
        Parser {
            source,
            tokens,
            pos: 0,
            fuel: Cell::new(256),
        }
    }

    fn slice(&self) -> &str {
        self.span().slice(self.source)
    }

    fn eof(&self) -> bool {
        self.pos == self.tokens.len()
    }

    fn advance(&mut self) {
        assert!(!self.eof());
        self.fuel.set(256);
        self.pos += 1;
    }

    fn nth(&self, n: usize) -> token::Kind {
        if self.fuel.get() == 0 {
            panic!("parser is stuck")
        }
        self.fuel.set(self.fuel.get() - 1);
        self.tokens.get(self.pos + n).map_or(token::Eof, |t| t.kind)
    }

    fn at(&self, kind: token::Kind) -> bool {
        self.nth(0) == kind
    }

    fn at_any(&self, kinds: &[token::Kind]) -> bool {
        for &kind in kinds {
            if self.at(kind) {
                return true;
            }
        }
        false
    }

    fn eat(&mut self, kind: token::Kind) -> bool {
        if self.at(kind) {
            self.advance();
            true
        } else {
            false
        }
    }

    fn span(&self) -> Span {
        self.tokens[self.pos].span
    }

    fn expect(&mut self, kind: token::Kind) -> Result<(), Error> {
        if self.eat(kind) {
            return Ok(());
        }

        if !self.eof() {
            Err(Error {
                span: self.span(),
                description: Description::UnexpectedToken {
                    got: self.nth(0),
                    expecting: kind,
                },
            })
        } else {
            Err(Error {
                span: self.span(),
                description: Description::UnexpectedToken {
                    got: token::Eof,
                    expecting: kind,
                },
            })
        }
    }
}

fn factor(p: &mut Parser) -> Result<Term, Error> {
    if p.at(token::LParen) {
        p.eat(token::LParen);
        let t = term(p);
        p.expect(token::RParen)?;
        t
    } else if p.at(token::Decimal) {
        let t = Term::Const(p.slice().parse().unwrap());
        p.eat(token::Decimal);
        Ok(t)
    } else if p.at(token::Ident) {
        let t = Term::Var(ustr(p.slice()), p.span());
        p.eat(token::Ident);
        Ok(t)
    } else {
        Err(Error {
            span: p.span(),
            description: Description::Other {
                message: "expected start of factor".to_string(),
            },
        })
    }
}

fn summand(p: &mut Parser) -> Result<Term, Error> {
    let first = factor(p)?;
    if p.at_any(&[token::Times, token::Slash]) {
        let mut factors = Vec::new();
        factors.push((LogSign::Multiply, first));
        while p.at_any(&[token::Times, token::Slash]) {
            let ls = if p.at(token::Times) {
                LogSign::Multiply
            } else {
                LogSign::Divide
            };
            p.advance();
            factors.push((ls, factor(p)?))
        }
        Ok(Term::Product(factors))
    } else {
        Ok(first)
    }
}

fn term(p: &mut Parser) -> Result<Term, Error> {
    let s = if p.at(token::Plus) {
        p.eat(token::Plus);
        Sign::Plus
    } else if p.at(token::Minus) {
        p.eat(token::Minus);
        Sign::Minus
    } else {
        Sign::Plus
    };
    let first = summand(p)?;
    if p.at_any(&[token::Plus, token::Minus]) {
        let mut summands = Vec::new();
        summands.push((s, first));
        while p.at_any(&[token::Plus, token::Minus]) {
            let s = if p.at(token::Plus) {
                Sign::Plus
            } else {
                Sign::Minus
            };
            p.advance();
            summands.push((s, summand(p)?));
        }
        Ok(Term::Sum(summands))
    } else if s == Sign::Minus {
        Ok(Term::Sum(vec![(s, first)]))
    } else {
        Ok(first)
    }
}

pub(super) fn parse(source: &str) -> Result<Term, Errors> {
    let lexed = lexer::lex(source)?;
    let mut p = Parser::new(source, &lexed);
    let t = term(&mut p).map_err(|e| Errors(vec![e]))?;
    if p.eof() {
        Ok(t)
    } else {
        Err(Errors(vec![Error {
            span: p.span(),
            description: Description::UnexpectedToken {
                got: p.nth(0),
                expecting: token::Eof,
            },
        }]))
    }
}

#[cfg(test)]
mod test {
    use super::super::pprint::WithSource;
    use super::parse;

    fn check_parse(source: &str, expected: &str) {
        let res = match parse(source) {
            Ok(t) => format!("{}", t),
            Err(e) => format!("{}", WithSource::new(source, &e)),
        };
        assert_eq!(&res, expected);
    }

    #[test]
    fn factors() {
        check_parse("1.2", "1.2");
        check_parse("alpha", "alpha");
        check_parse("(1 + 2)", "(+ 1 + 2)");
    }

    #[test]
    fn summands() {
        check_parse("a * 3", "(* a * 3)");
        check_parse("2 * b * c", "(* 2 * b * c)");
        check_parse("2 * b / c", "(* 2 * b / c)");
    }

    #[test]
    fn terms() {
        check_parse("2 * a + 3 * b", "(+ (* 2 * a) + (* 3 * b))");
        check_parse("- a", "(- a)");
        check_parse("- a + b * 2", "(- a + (* b * 2))");
    }
}
