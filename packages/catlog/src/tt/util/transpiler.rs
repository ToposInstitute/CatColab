//! Transpilation of elaborated instances to Julia (Decapodes.jl).

use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;
use ustr::ustr;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::dbl::modal::{
    ModalDblModelInstance, ModalInstanceBase, ModalInstanceTerm, ModalMor, ModalOb,
    modal_mor_as_identity,
};
use crate::dbl::theory::Unital;
use crate::stdlib::th_multicategory;
use crate::tt::modelgen::{ModelInstance, instance_from_def};
use crate::tt::notebook_elab::Elaborator;
use crate::tt::theory::{Theory, TheoryDef};
use crate::tt::toplevel::{Instance, TopDecl, Toplevel};
use crate::tt::val::BaseTyV_;
use crate::zero::{NameSegment, Namespace, QualifiedName, name};
use catcolab_document_types::current as nb;

static ANON: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(.+)_(\w+)([0-9]+)$").unwrap());
static FORM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"([0-9]+)-Form$").unwrap());
static DUAL_FORM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"Dual ([0-9]+)-Form").unwrap());

/// A transpiled Julia expression, ready for the simulation service.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct Target {
    /// The Julia expression, e.g. the body of a `@decapode` macro call.
    #[cfg_attr(feature = "serde", serde(rename = "pode"))]
    pub out: String,

    /// Variables declared as `Constant`, to be supplied as parameters.
    #[cfg_attr(feature = "serde", serde(rename = "constants"))]
    pub constants: Vec<String>,
}

/// Transpilation to an expression in Julia.
pub trait JuliaTranspiler {
    /// Transpile to a Julia expression.
    fn transpile(&self) -> Target;
}

/// Transpiles an instance of a DEC model to a Decapodes.jl `@decapode`
/// expression: generators become variable declarations typed by the label of
/// the model object they lie over, and equations become the `@decapode`
/// equations, with equations between bare generators (gluings and
/// specializations) applied as substitutions.
pub struct Decapodes {
    /// The instance presented by the diagram notebook(s).
    pub instance: ModalDblModelInstance<Unital>,
    /// Labels for the instance's generators and the model's objects and
    /// morphisms, as returned by [`instance_from_def`].
    pub ns: Namespace,
}

impl Decapodes {
    // TODO needs Result
    /// Elaborate a model notebook and the diagram notebooks presenting an
    /// instance of it — `diagram_map` holds the diagrams that `diagram`
    /// instantiates, keyed by the ref ids its instantiation cells link to —
    /// and transpile the resulting instance.
    pub fn elab_and_transpile(
        model: nb::ModelDocumentContent,
        diagram: nb::DiagramDocumentContent,
        diagram_map: HashMap<String, nb::DiagramDocumentContent>,
    ) -> Target {
        let theory =
            Theory::new(name("ThMulticategory"), TheoryDef::modal_unital(th_multicategory()));
        let mut toplevel = Toplevel::new(Default::default());

        // The codomain model.
        let model_ty_v = {
            let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));
            elab.notebook(model.notebook.formal_content()).1
        };
        let BaseTyV_::Record(codomain) = &*model_ty_v else {
            panic!("model did not elaborate to a record");
        };
        let codomain = codomain.clone();

        // The instantiated diagrams, as importable instances.
        for (ref_id, diag) in diagram_map {
            let inst = {
                let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(&ref_id));
                let (stx, val) = elab.diagram_notebook(&codomain, diag.notebook.formal_content());
                Instance::new(theory.clone(), stx, val, model_ty_v.clone())
            };
            toplevel
                .declarations
                .insert(NameSegment::Text(ustr(&ref_id)), TopDecl::Instance(inst));
        }

        // The main diagram, as an instance ready for generation.
        let inst = {
            let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));
            let (stx, val) = elab.diagram_notebook(&codomain, diagram.notebook.formal_content());
            Instance::new(theory.clone(), stx, val, model_ty_v.clone())
        };
        let (instance, ns) = instance_from_def(&toplevel, &theory.definition, &inst)
            .expect("instance generation failed");
        let ModelInstance::ModalUnital(instance) = instance else {
            panic!("expected an instance of a modal model");
        };
        Decapodes { instance, ns }.transpile()
    }
}

impl JuliaTranspiler for Decapodes {
    fn transpile(&self) -> Target {
        let ns = &self.ns;

        // Variable declarations: each generator, typed by the label of the
        // model object it lies over. Generators over composite objects
        // (lists, tensors) have no direct Decapodes counterpart.
        let mut obs: IndexMap<String, String> = IndexMap::new();
        for (gen_name, fiber) in self.instance.generators() {
            let ModalOb::Generator(model_ob) = fiber else {
                continue;
            };
            obs.insert(var_name(ns, &gen_name), form_type(&ns.label_string(model_ob)));
        }

        // Equations. Bare-generator equations (gluings from instantiation
        // specializations, and `eq_*`-labeled morphisms) become
        // substitutions; the rest become `@decapode` equations, rendered
        // with the codomain element on the left as before.
        let mut subs: HashMap<String, String> = HashMap::new();
        let mut mors: IndexSet<(String, String)> = IndexSet::new();
        for (lhs, rhs) in self.instance.equations() {
            if let (Some(l), Some(r)) = (bare_generator(lhs), bare_generator(rhs)) {
                subs.insert(var_name(ns, l), var_name(ns, r));
                continue;
            }
            // An `eq_*` morphism applied to a single generator marks an
            // equality of elements, not an operation.
            if let Some(mor) = mor_generator(&lhs.mor)
                && EQ.is_match(&ns.label_string(mor))
                && let Some(dom) = single_base_generator(&lhs.base)
                && let Some(r) = bare_generator(rhs)
            {
                subs.insert(var_name(ns, dom), var_name(ns, r));
                continue;
            }
            mors.insert((render_term(ns, rhs), render_term(ns, lhs)));
        }

        // Remove specialized obs from declarations
        for bound in subs.keys() {
            // XXX swap_remove is slow, i understand
            obs.swap_remove(bound);
        }

        // Rewrite morphism terms
        let mors: IndexSet<_> = mors
            .into_iter()
            .map(|(lhs, rhs)| {
                let mut lhs = lhs;
                let mut rhs = rhs;
                // TODO this is not happy. what if a non-variable term matched the replacement substring
                for (from, to) in &subs {
                    lhs = lhs.replace(from.as_str(), to);
                    rhs = rhs.replace(from.as_str(), to);
                }
                (lhs, rhs)
            })
            .collect();

        let mut out = String::new();
        let mut constants = Vec::new();

        for (ob, ty) in obs {
            if !ANON.is_match(&ob) {
                out.push_str(&format!("\t{}::{}\n", ob, ty));
                if ty == "Constant" {
                    constants.push(ob);
                }
            }
        }

        for (lhs, rhs) in mors {
            out.push_str(&format!("\n\t{} == {}", lhs, rhs));
        }
        Target { out, constants }
    }
}

static ADD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"add_(.+)$").unwrap());
static SUBTRACT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"subtract_(.+)$").unwrap());
static MULT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"multiplication_(.+)$").unwrap());
static PARTIAL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"partial_(.+)$").unwrap());
static D: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"d_(.+)$").unwrap());
static LAPL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"laplace_(.+)$").unwrap());
static STAR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"star_(.+)$").unwrap());
static INV_STAR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"inv_star_(.+)$").unwrap());
static EQ: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"eq_(.+)$").unwrap());
static LIE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"lie_(.+)$").unwrap());

/// The Decapodes name of an instance generator: its qualified label with
/// import prefixes joined by underscores.
fn var_name(ns: &Namespace, name: &QualifiedName) -> String {
    ns.label_string(name).replace('.', "_")
}

/// The Decapodes type for a model object label, e.g. `Dual 0-Form` ->
/// `DualForm0`. Labels with no Form structure (e.g. `Constant`) pass through.
fn form_type(label: &str) -> String {
    match label {
        p if DUAL_FORM.is_match(p) => {
            let dim = &DUAL_FORM.captures(p).unwrap()[1];
            format!("DualForm{dim}")
        }
        p if FORM.is_match(p) => {
            let dim = &FORM.captures(p).unwrap()[1];
            format!("Form{dim}")
        }
        p => p.to_string(),
    }
}

/// The Decapodes operator for a model morphism or object-operation label.
fn julia_op(op: &str) -> String {
    match op {
        op if ADD.is_match(op) => "+".to_string(),
        op if SUBTRACT.is_match(op) => "-".to_string(),
        op if MULT.is_match(op) => "*".to_string(),
        op if D.is_match(op) => "d".to_string(),
        op if STAR.is_match(op) => format!("{}", '\u{2605}'),
        op if INV_STAR.is_match(op) => String::new(),
        op if LIE.is_match(op) => "L".to_string(),
        op if PARTIAL.is_match(op) => format!("{}{}", '\u{2202}', '\u{209C}'),
        op if LAPL.is_match(op) => format!("{}", '\u{0394}'),
        op => op.to_string(),
    }
}

/// The generator of a term that is a bare generator (an identity morphism
/// applied to a single-generator base), if it is one.
fn bare_generator(tm: &ModalInstanceTerm) -> Option<&QualifiedName> {
    modal_mor_as_identity(&tm.mor)?;
    match &tm.base {
        ModalInstanceBase::Generator(name) => Some(name),
        _ => None,
    }
}

/// The generating morphism a modal morphism consists of, if it is a single
/// generator (possibly as a singleton composite).
fn mor_generator(mor: &ModalMor) -> Option<&QualifiedName> {
    match mor {
        ModalMor::Generator(name) => Some(name),
        ModalMor::Composite(path) => match path.as_ref() {
            crate::one::path::Path::Seq(edges) if edges.len() == 1 => mor_generator(edges.first()),
            _ => None,
        },
        _ => None,
    }
}

/// The single generator in a base that is one generator, possibly as a
/// singleton list (the argument shape of a unary multihom application).
fn single_base_generator(base: &ModalInstanceBase) -> Option<&QualifiedName> {
    match base {
        ModalInstanceBase::Generator(name) => Some(name),
        ModalInstanceBase::List(_, bases) if bases.len() == 1 => single_base_generator(&bases[0]),
        _ => None,
    }
}

/// An applicative rendering of a modal instance term, reconstructed from its
/// flat `(mor, base)` normal form so it prints in Decapodes surface syntax.
/// Mirrors the snapshot renderer in [`crate::tt::batch`], with operator
/// names mapped through [`julia_op`].
enum Rendered {
    Gen(String),
    App(String, Box<Rendered>),
    List(Vec<Rendered>),
}

impl Rendered {
    fn render(&self) -> String {
        match self {
            Rendered::Gen(name) => name.clone(),
            Rendered::App(op, inner) => format!("{op}({})", inner.render()),
            Rendered::List(items) => {
                let inner: Vec<_> = items.iter().map(Rendered::render).collect();
                inner.join(", ")
            }
        }
    }
}

fn render_term(ns: &Namespace, tm: &ModalInstanceTerm) -> String {
    apply_mor(ns, &tm.mor, base_rendered(ns, &tm.base)).render()
}

fn base_rendered(ns: &Namespace, base: &ModalInstanceBase) -> Rendered {
    match base {
        ModalInstanceBase::Generator(name) => Rendered::Gen(var_name(ns, name)),
        ModalInstanceBase::List(_, bases) => {
            Rendered::List(bases.iter().map(|b| base_rendered(ns, b)).collect())
        }
        ModalInstanceBase::ObApp(op, inner) => {
            Rendered::App(julia_op(&format!("{op}")), Box::new(base_rendered(ns, inner)))
        }
    }
}

fn apply_mor(ns: &Namespace, mor: &ModalMor, arg: Rendered) -> Rendered {
    if modal_mor_as_identity(mor).is_some() {
        return arg;
    }
    match mor {
        ModalMor::Generator(name) => Rendered::App(julia_op(&ns.label_string(name)), Box::new(arg)),
        ModalMor::App(_, op) => Rendered::App(julia_op(&format!("{op}")), Box::new(arg)),
        // The functorial action of an object operation: the lifted morphisms
        // act on the operation's content.
        ModalMor::HomApp(path, _op) => match arg {
            Rendered::App(op_name, inner) => {
                Rendered::App(op_name, Box::new(apply_path(ns, path, *inner)))
            }
            other => other,
        },
        ModalMor::Composite(path) => apply_path(ns, path, arg),
        ModalMor::List(_, mors) => match arg {
            Rendered::List(items) if items.len() == mors.len() => {
                Rendered::List(mors.iter().zip(items).map(|(m, a)| apply_mor(ns, m, a)).collect())
            }
            other => other,
        },
    }
}

fn apply_path(
    ns: &Namespace,
    path: &crate::one::path::Path<ModalOb, ModalMor>,
    arg: Rendered,
) -> Rendered {
    match path {
        crate::one::path::Path::Id(_) => arg,
        crate::one::path::Path::Seq(edges) => {
            edges.iter().fold(arg, |acc, mor| apply_mor(ns, mor, acc))
        }
    }
}
