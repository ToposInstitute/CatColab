//! Parser from surface syntax into the mtt [AST](super::ast).
//!
//! ```text
//! impl Monoid for Multicategory {
//!   const X : Object;
//!   const op : [X, X] -> X;
//!   const unit : [] -> X over P;
//!
//!   fn left_assoc([a, b, c] : [X, X, X]) -> X {
//!     op([op([a, b]) : [X, X] -> X, c : [X] -> X])
//!   }
//!
//!   rel assoc([x, y, z] : [X, X, X]) -> X {
//!     left_assoc([x, y, z]) == right_assoc([x, y, z])
//!   }
//! }
//! ```

use crate::mtt::ast::*;

peg::parser! {
    grammar mtt_parser() for str {
        rule _() = quiet!{[' ' | '\n' | '\r' | '\t']*}

        rule keyword()
            = ("impl" / "for" / "const" / "fn" / "rel" / "over") !['a'..='z' | 'A'..='Z' | '0'..='9' | '_']

        rule ident() -> String
            = !keyword() s:$(['a'..='z' | 'A'..='Z' | '_']['a'..='z' | 'A'..='Z' | '0'..='9' | '_']*) { s.to_string() }
            / expected!("identifier")

        pub rule model() -> Model
            = _ "impl" _ name:ident() _ "for" _ theory:ident() _ "{" decls:decl()* _ "}" _ {
                Model { name, theory, decls }
            }

        rule decl() -> Decl
            = d:decl_relation() { d }
            / d:decl_definition() { d }
            / d:decl_pro_arrow_generator() { d }
            / d:decl_object_generator() { d }

        rule decl_object_generator() -> Decl
            = _ "const" _ name:ident() _ ":" _ over:expression() _ ";" {
                Decl::ObjectGenerator { name, over }
            }

        rule decl_pro_arrow_generator() -> Decl
            = _ "const" _ name:ident() _ ":" _ dom:expression() _ "->" _ cod:expression() _ over:over_clause()? _ ";" {
                Decl::ProArrowGenerator {
                    name,
                    dom,
                    cod,
                    over: over.unwrap_or(ExpressionProArrow::None),
                }
            }

        rule decl_definition() -> Decl
            = _ "fn" _ name:ident() _ "(" _ binder:binder() _ ")" _ "->" _ codomain:expression() _ over:over_clause()? _ "{" _ body:expression() _ "}" {
                Decl::Definition {
                    name,
                    binder,
                    codomain,
                    over: over.unwrap_or(ExpressionProArrow::None),
                    body,
                }
            }

        rule decl_relation() -> Decl
            = _ "rel" _ name:ident() _ "(" _ binder:binder() _ ")" _ "->" _ codomain:expression() _ over:over_clause()? _ "{" _ lhs:expression() _ "==" _ rhs:expression() _ "}" {
                Decl::Relation {
                    name,
                    binder,
                    codomain,
                    over: over.unwrap_or(ExpressionProArrow::None),
                    lhs,
                    rhs,
                }
            }

        rule binder() -> Binder
            = object_term:expression() _ ":" _ object_type:expression() {
                Binder { object_term, object_type }
            }

        rule over_clause() -> ExpressionProArrow
            = "over" _ name:ident() { ExpressionProArrow::NameOnly(name) }

        // -----------------------------------------------------------------
        // Expressions

        rule expression() -> Expression = precedence!{
            subject:(@) _ ":" _ domain:expression() _ "->" _ codomain:expression() {
                Expression::ProArrowAnnotation {
                    subject: Box::new(subject),
                    domain: Box::new(domain),
                    codomain: Box::new(codomain),
                    over: Box::new(ExpressionProArrow::None),
                }
            }
            --
            head:@ _ "(" _ arg:expression() _ ")" {
                Expression::Juxtaposition {
                    post: Box::new(head),
                    pre: Box::new(arg),
                }
            }
            --
            e:atom() { e }
        }

        rule atom() -> Expression
            = "[" _ items:(expression() ** (_ "," _)) _ "]" {
                Expression::List(items)
            }
            / "(" _ e:expression() _ ")" { e }
            / name:ident() { Expression::Literal(name) }
    }
}

/// Parse a source string into a single [Model].
pub fn parse_model(input: &str) -> Result<Model, String> {
    mtt_parser::model(input).map_err(|e| format!("{e}"))
}
