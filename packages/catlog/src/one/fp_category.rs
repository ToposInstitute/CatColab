//! Finitely presented categories backed by e-graphs.

use egglog::ast::{Command, Expr, Rewrite, Schema, Symbol, Variant, call, var};
use egglog::span;

/// Program builder for categories in egglog.
struct CategoryProgram {
    sym: CategorySymbols,
    prog: Vec<Command>,
}

impl CategoryProgram {
    /// Creates a new program builder.
    pub fn new() -> Self {
        Default::default()
    }

    /// Extracts the egglog program statements, consuming them.
    pub fn program(&mut self) -> Vec<Command> {
        std::mem::take(&mut self.prog)
    }

    /// Constructs a domain call.
    pub fn dom(&self, mor: Expr) -> Expr {
        call!(self.sym.dom, vec![mor])
    }

    /// Constructs a codomain call.
    pub fn cod(&self, mor: Expr) -> Expr {
        call!(self.sym.cod, vec![mor])
    }

    /// Constructs an identity call.
    pub fn id(&self, ob: Expr) -> Expr {
        call!(self.sym.id, vec![ob])
    }

    /// Constructs a binary composition call.
    pub fn compose2(&self, f: Expr, g: Expr) -> Expr {
        call!(self.sym.compose, vec![f, g])
    }

    /// Generates the preamble for the program.
    fn preamble(&mut self) {
        let sym = &self.sym;
        self.prog = vec![
            // Type and term constructors.
            Command::Datatype {
                span: span!(),
                name: sym.ob,
                variants: vec![Variant {
                    span: span!(),
                    name: sym.ob_gen,
                    types: vec!["String".into()],
                    cost: Some(0),
                }],
            },
            Command::Datatype {
                span: span!(),
                name: sym.mor,
                variants: vec![Variant {
                    span: span!(),
                    name: sym.mor_gen,
                    types: vec!["String".into()],
                    cost: Some(0),
                }],
            },
            Command::Constructor {
                span: span!(),
                name: sym.dom,
                schema: Schema {
                    input: vec![sym.mor],
                    output: sym.ob,
                },
                cost: Some(1),
                unextractable: false,
            },
            Command::Constructor {
                span: span!(),
                name: sym.cod,
                schema: Schema {
                    input: vec![sym.mor],
                    output: sym.ob,
                },
                cost: Some(1),
                unextractable: false,
            },
            Command::Constructor {
                span: span!(),
                name: sym.id,
                schema: Schema {
                    input: vec![sym.ob],
                    output: sym.mor,
                },
                cost: Some(1),
                unextractable: false,
            },
            Command::Constructor {
                span: span!(),
                name: sym.compose,
                schema: Schema {
                    input: vec![sym.mor, sym.mor],
                    output: sym.mor,
                },
                cost: Some(1),
                unextractable: false,
            },
            // Typing axioms for composites and identities.
            Command::AddRuleset(sym.axioms),
            Command::Rewrite(
                sym.axioms,
                Rewrite {
                    span: span!(),
                    lhs: self.dom(self.id(var!("x"))),
                    rhs: var!("x"),
                    conditions: vec![],
                },
                false,
            ),
            Command::Rewrite(
                sym.axioms,
                Rewrite {
                    span: span!(),
                    lhs: self.cod(self.id(var!("x"))),
                    rhs: var!("x"),
                    conditions: vec![],
                },
                false,
            ),
            Command::Rewrite(
                sym.axioms,
                Rewrite {
                    span: span!(),
                    lhs: self.dom(self.compose2(var!("f"), var!("g"))),
                    rhs: self.dom(var!("f")),
                    conditions: vec![],
                },
                false,
            ),
            Command::Rewrite(
                sym.axioms,
                Rewrite {
                    span: span!(),
                    lhs: self.cod(self.compose2(var!("f"), var!("g"))),
                    rhs: self.cod(var!("g")),
                    conditions: vec![],
                },
                false,
            ),
            // Associativity and unitality axioms, where associativity is a
            // bidirectional rewrite and unitality is unidirectional rewrites.
            Command::Rewrite(
                sym.axioms,
                Rewrite {
                    span: span!(),
                    lhs: self.compose2(self.compose2(var!("f"), var!("g")), var!("h")),
                    rhs: self.compose2(var!("f"), self.compose2(var!("g"), var!("h"))),
                    conditions: vec![],
                },
                false,
            ),
            Command::Rewrite(
                sym.axioms,
                Rewrite {
                    span: span!(),
                    lhs: self.compose2(var!("f"), self.compose2(var!("g"), var!("h"))),
                    rhs: self.compose2(self.compose2(var!("f"), var!("g")), var!("h")),
                    conditions: vec![],
                },
                false,
            ),
            Command::Rewrite(
                sym.axioms,
                Rewrite {
                    span: span!(),
                    lhs: self.compose2(var!("f"), self.id(var!("y"))),
                    rhs: var!("f"),
                    conditions: vec![], // Should we check cod(f) == y?
                },
                false,
            ),
            Command::Rewrite(
                sym.axioms,
                Rewrite {
                    span: span!(),
                    lhs: self.compose2(self.id(var!("x")), var!("f")),
                    rhs: var!("f"),
                    conditions: vec![], // Should we check dom(f) == x?
                },
                false,
            ),
        ]
    }
}

impl Default for CategoryProgram {
    fn default() -> Self {
        let mut result = Self {
            sym: Default::default(),
            prog: vec![],
        };
        result.preamble();
        result
    }
}

#[derive(Clone)]
struct CategorySymbols {
    ob: Symbol,
    mor: Symbol,
    ob_gen: Symbol,
    mor_gen: Symbol,
    dom: Symbol,
    cod: Symbol,
    id: Symbol,
    compose: Symbol,
    axioms: Symbol,
}

impl Default for CategorySymbols {
    fn default() -> Self {
        Self {
            ob: "Ob".into(),
            mor: "Mor".into(),
            ob_gen: "ObGen".into(),
            mor_gen: "MorGen".into(),
            dom: "dom".into(),
            cod: "cod".into(),
            id: "id".into(),
            compose: "compose".into(),
            axioms: "CatAxioms".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use expect_test::expect;
    use itertools::Itertools;

    /// Format an egglog program as a string.
    fn format_program(prog: Vec<Command>) -> String {
        prog.into_iter().map(|command| command.to_string()).join("\n")
    }

    #[test]
    fn th_category() {
        let prog = CategoryProgram::new().program();

        let expected = expect![[r#"
            (datatype Ob (ObGen String :cost 0))
            (datatype Mor (MorGen String :cost 0))
            (constructor dom (Mor) Ob :cost 1)
            (constructor cod (Mor) Ob :cost 1)
            (constructor id (Ob) Mor :cost 1)
            (constructor compose (Mor Mor) Mor :cost 1)
            (ruleset CatAxioms)
            (rewrite (dom (id x)) x :ruleset CatAxioms)
            (rewrite (cod (id x)) x :ruleset CatAxioms)
            (rewrite (dom (compose f g)) (dom f) :ruleset CatAxioms)
            (rewrite (cod (compose f g)) (cod g) :ruleset CatAxioms)
            (rewrite (compose (compose f g) h) (compose f (compose g h)) :ruleset CatAxioms)
            (rewrite (compose f (compose g h)) (compose (compose f g) h) :ruleset CatAxioms)
            (rewrite (compose f (id y)) f :ruleset CatAxioms)
            (rewrite (compose (id x) f) f :ruleset CatAxioms)"#]];
        expected.assert_eq(&format_program(prog.clone()));

        let mut egraph: egglog::EGraph = Default::default();
        assert!(egraph.run_program(prog).is_ok());
    }
}
