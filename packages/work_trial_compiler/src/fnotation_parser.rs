//! FNotation parser
//!
//! Parse pure string into FNotation AST

use bumpalo::Bump;
use fnotation::grammar::parse_term;
use fnotation::lexer::lex;
use fnotation::parser::Prec;
use fnotation::{FNtn, ParseConfig, token::Token};
use std::collections::HashMap;
use tattle::Reporter;

pub struct FNotationParser {
    config: ParseConfig<'static>,
}

// Helper struct to keep everything alive together
pub struct ParseContext {
    pub arena: Bump,
    pub tokens: Vec<Token>,
    pub prectable: HashMap<String, Prec>,
}

impl FNotationParser {
    pub fn new() -> Self {
        const CONFIG: ParseConfig<'_> = ParseConfig::new(&[("=", Prec::lassoc(10))], &["="], &[]);

        FNotationParser { config: CONFIG }
    }

    /// Create the parsing context (arena, tokens, prectable)
    pub fn create_context(&self, input: &str) -> Result<ParseContext, String> {
        let reporter = Reporter::new();

        let prectable: HashMap<_, _> = self
            .config
            .precedences
            .iter()
            .map(|(name, p)| (name.to_string(), *p))
            .collect();

        let tokens = lex(input, &self.config, reporter.clone())
            .map_err(|e| format!("Lexing error: {:?}", e))?;

        Ok(ParseContext {
            arena: Bump::new(),
            tokens,
            prectable,
        })
    }

    /// Parse using the context
    pub fn parse_to_fnotation<'a>(
        &self,
        input: &'a str,
        context: &'a ParseContext,
    ) -> Result<&'a FNtn<'a>, String> {
        let reporter = Reporter::new();

        let fntn_ast = parse_term(
            // requires all same lifetimes
            input,
            reporter.clone(),
            &context.prectable,
            &context.tokens,
            &context.arena,
        );

        if reporter.errored() {
            return Err("Parse error occurred".to_string());
        }

        Ok(fntn_ast)
    }
}
