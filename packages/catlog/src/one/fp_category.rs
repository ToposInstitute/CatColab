//! Finitely presented categories backed by e-graphs.

use std::hash::{BuildHasher, Hash, RandomState};

use derivative::Derivative;
use egglog::ast::{
    Action, Command, Expr, GenericRunConfig, Rewrite, Schedule, Schema, Symbol, Variant,
};
use egglog::{EGraph, call, lit, span, var};
use ref_cast::RefCast;

use super::{category::*, graph::*, path::*};
use crate::egglog_util::{Program, ToSymbol};

/// A finitely presented category.
#[derive(Clone, Derivative)]
#[derivative(Default(bound = "S: Default"))]
pub struct FpCategory<V, E, S = RandomState> {
    generators: HashGraph<V, E, S>,
    builder: CategoryProgramBuilder,
    egraph: EGraph,
}

impl<V, E, S> FpCategory<V, E, S>
where
    V: Eq + Clone + Hash + ToSymbol,
    E: Eq + Clone + Hash + ToSymbol,
    S: BuildHasher,
{
    /// Adds an object generator.
    pub fn add_ob_generator(&mut self, v: V) {
        assert!(self.generators.add_vertex(v.clone()));
        self.builder.add_ob_generator(v.to_symbol());
    }

    /// Adds several object generators at once.
    pub fn add_ob_generators(&mut self, iter: impl IntoIterator<Item = V>) {
        for v in iter {
            self.add_ob_generator(v)
        }
    }

    /// Adds a morphism generator.
    pub fn add_mor_generator(&mut self, e: E, dom: V, cod: V) {
        assert!(self.generators.add_edge(e.clone(), dom.clone(), cod.clone()));
        self.builder.add_mor_generator(
            e.to_symbol(),
            self.ob_generator_expr(dom),
            self.ob_generator_expr(cod),
        );
    }

    /// Adds a path equation to the presentation.
    pub fn equate(&mut self, eq: PathEq<V, E>) {
        self.builder.equate(self.path_expr(eq.lhs), self.path_expr(eq.rhs));
    }

    /// Are two composites in the category equal?
    pub fn is_equal(&mut self, lhs: Path<V, E>, rhs: Path<V, E>) -> bool {
        self.builder.check_equal(self.path_expr(lhs), self.path_expr(rhs));
        self.builder
            .program()
            .check_in(&mut self.egraph)
            .expect("Unexpected egglog error")
    }

    fn ob_generator_expr(&self, v: V) -> Expr {
        self.builder.ob_generator(v.to_symbol())
    }
    fn mor_generator_expr(&self, e: E) -> Expr {
        self.builder.mor_generator(e.to_symbol())
    }
    fn path_expr(&self, path: Path<V, E>) -> Expr {
        path.map_reduce(
            |v| self.builder.id(self.ob_generator_expr(v)),
            |e| self.mor_generator_expr(e),
            |f, g| self.builder.compose2(f, g),
        )
    }
}

impl<V, E, S> Category for FpCategory<V, E, S>
where
    V: Eq + Clone + Hash + ToSymbol,
    E: Eq + Clone + Hash + ToSymbol,
    S: BuildHasher,
{
    type Ob = V;
    type Mor = Path<V, E>;

    fn has_ob(&self, x: &Self::Ob) -> bool {
        self.generators.has_vertex(x)
    }
    fn has_mor(&self, path: &Self::Mor) -> bool {
        path.contained_in(&self.generators)
    }
    fn dom(&self, path: &Self::Mor) -> Self::Ob {
        path.src(&self.generators)
    }
    fn cod(&self, path: &Self::Mor) -> Self::Ob {
        path.tgt(&self.generators)
    }

    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor {
        path.flatten_in(&self.generators).expect("Paths should be composable")
    }
    fn compose2(&self, path1: Self::Mor, path2: Self::Mor) -> Self::Mor {
        path1
            .concat_in(&self.generators, path2)
            .expect("Target of first path should equal source of second path")
    }
}

impl<V, E, S> FgCategory for FpCategory<V, E, S>
where
    V: Eq + Clone + Hash + ToSymbol,
    E: Eq + Clone + Hash + ToSymbol,
    S: BuildHasher,
{
    type ObGen = V;
    type MorGen = E;

    fn ob_generators(&self) -> impl Iterator<Item = Self::ObGen> {
        self.generators.vertices()
    }
    fn mor_generators(&self) -> impl Iterator<Item = Self::MorGen> {
        self.generators.edges()
    }
    fn mor_generator_dom(&self, f: &Self::MorGen) -> Self::Ob {
        self.generators.src(f)
    }
    fn mor_generator_cod(&self, f: &Self::MorGen) -> Self::Ob {
        self.generators.tgt(f)
    }
}

/// Program builder for computing with categories in egglog.
#[derive(Clone)]
struct CategoryProgramBuilder {
    prog: Vec<Command>,
    sym: CategorySymbols,
}

impl CategoryProgramBuilder {
    /// Extracts the egglog program, consuming the cached statements.
    pub fn program(&mut self) -> Program {
        Program(std::mem::take(&mut self.prog))
    }

    /// Declares an object generator.
    pub fn add_ob_generator(&mut self, name: Symbol) {
        let action = Action::Expr(span!(), self.ob_generator(name));
        self.prog.push(Command::Action(action));
    }

    /// Declares a morphism generator and sets its domain and codmain.
    pub fn add_mor_generator(&mut self, name: Symbol, dom: Expr, cod: Expr) {
        self.make_mor_generator(name);
        self.set_dom(self.mor_generator(name), dom);
        self.set_cod(self.mor_generator(name), cod);
    }

    /// Declares a morphism generator.
    pub fn make_mor_generator(&mut self, name: Symbol) {
        let action = Action::Expr(span!(), self.mor_generator(name));
        self.prog.push(Command::Action(action));
    }

    /// Sets the domain of a morphism.
    pub fn set_dom(&mut self, mor: Expr, ob: Expr) {
        let dom = self.dom(mor);
        Program::ref_cast_mut(&mut self.prog).union(dom, ob);
    }

    /// Sets the codomain of a morphism.
    pub fn set_cod(&mut self, mor: Expr, ob: Expr) {
        let cod = self.cod(mor);
        Program::ref_cast_mut(&mut self.prog).union(cod, ob);
    }

    /// Constructs an object generator expression.
    pub fn ob_generator(&self, name: Symbol) -> Expr {
        call!(self.sym.ob_gen, vec![lit!(name)])
    }

    /// Constructors a morphism generator expression.
    pub fn mor_generator(&self, name: Symbol) -> Expr {
        call!(self.sym.mor_gen, vec![lit!(name)])
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

    /// Equates two expressions in the category.
    pub fn equate(&mut self, lhs: Expr, rhs: Expr) {
        Program::ref_cast_mut(&mut self.prog).union(lhs, rhs);
    }

    /// Checks whether the expressions are equal.
    pub fn check_equal(&mut self, lhs: Expr, rhs: Expr) {
        let schedule = self.schedule();
        Program::ref_cast_mut(&mut self.prog).check_equal(lhs, rhs, Some(schedule));
    }

    /// Constructs a schedule to saturate the category axioms.
    fn schedule(&self) -> Schedule {
        Schedule::Saturate(
            span!(),
            Box::new(Schedule::Run(
                span!(),
                GenericRunConfig {
                    ruleset: self.sym.axioms,
                    until: None,
                },
            )),
        )
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

impl Default for CategoryProgramBuilder {
    fn default() -> Self {
        let mut result = Self {
            prog: vec![],
            sym: Default::default(),
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
    use nonempty::nonempty;

    #[test]
    fn sch_sgraph() {
        let mut sch_sgraph: FpCategory<_, _, RandomState> = Default::default();
        sch_sgraph.add_ob_generators(['V', 'E']);
        sch_sgraph.add_mor_generator('s', 'E', 'V');
        sch_sgraph.add_mor_generator('t', 'E', 'V');
        sch_sgraph.add_mor_generator('i', 'E', 'E');
        sch_sgraph.equate(PathEq::new(Path::pair('i', 'i'), Path::empty('E')));
        sch_sgraph.equate(PathEq::new(Path::pair('i', 's'), Path::single('t')));
        sch_sgraph.equate(PathEq::new(Path::pair('i', 't'), Path::single('s')));
        assert!(!sch_sgraph.is_equal(Path::single('s'), Path::single('t')));
        assert!(sch_sgraph.is_equal(Path::pair('i', 'i'), Path::empty('E')));
        assert!(sch_sgraph.is_equal(Path::Seq(nonempty!['i', 'i', 'i', 's']), Path::single('t')));
    }

    #[test]
    fn egraph_preamble() {
        let prog = CategoryProgramBuilder::default().program();

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
            (rewrite (compose (id x) f) f :ruleset CatAxioms)
        "#]];
        expected.assert_eq(&prog.to_string());

        let mut egraph: EGraph = Default::default();
        assert!(prog.run_in(&mut egraph).is_ok());
    }
}
