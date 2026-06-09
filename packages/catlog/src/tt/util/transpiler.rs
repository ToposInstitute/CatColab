use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

use crate::tt::eval::Evaluator;
use crate::tt::modelgen::diagram_from_diag;
use crate::tt::stx::{TmS, TmS_, TyS_};
use crate::tt::toplevel::{TopDecl, Toplevel};
use crate::tt::val::{TmV, TyV, TyV_};
use crate::zero::name_seg;

pub trait JuliaTranspiler {
    fn transpile(&self) -> String;
}

pub struct Decapodes {
    pub pode: TyV,
}

impl JuliaTranspiler for Decapodes {
    fn transpile(&self) -> String {
        let TyV_::Record(r) = &*self.pode else {
            panic!()
        };
        let toplevel = Toplevel::new(Default::default());
        let eval = Evaluator::empty(&toplevel);
        let (self_n, eval) = eval.bind_self(self.pode.clone());
        let self_v = eval.eta_neu(&self_n, &self.pode);

        let mut obs = IndexMap::new();
        let mut mors = IndexSet::new();
        collect_fields(&eval, &self.pode, &self_v, "", &mut obs, &mut mors);

        let mut out = String::new();

        for (ob, ty) in obs {
            // `first` is unhappy
            out.push_str(&format!("\t{}::{}\n", ob, ty.first().unwrap()));
        }

        for (lhs, rhs) in mors {
            out.push_str(&format!("\n\t{} == {}", lhs, rhs));
        }
        out
    }
}

fn collect_fields(
    eval: &Evaluator,
    ty: &TyV,
    self_v: &TmV,
    prefix: &str,
    obs: &mut IndexMap<String, Vec<String>>,
    mors: &mut IndexSet<(String, String)>,
) {
    let TyV_::Record(r) = &**ty else { return };
    for (name, (label, _)) in r.fields.iter() {
        let field_ty = eval.field_ty(ty, self_v, *name);
        let field_v = eval.proj(self_v, *name, *label);
        let qt = eval.quote_ty(&field_ty);

        let full_label = if prefix.is_empty() {
            label.to_string()
        } else {
            format!("{}_{}", prefix, label)
        };

        match &*qt {
            TyS_::Over(path) => {
                let p = path.iter().map(|(_, l)| l.to_string()).collect();
                obs.insert(full_label, p);
            }

            TyS_::Morphism(_, dom, cod) => {
                let dom = to_plain_text(dom);
                let cod = to_plain_text(cod);
                let op = &format!("{label}");
                if EQ.is_match(op) {
                    mors.insert((cod, dom));
                } else {
                    let op = match op {
                        op if ADD.is_match(op) => "+",
                        op if SUBTRACT.is_match(op) => "-",
                        op if MULT.is_match(op) => "*",
                        op if PARTIAL.is_match(op) => &format!("{}{}", '\u{2202}', '\u{209C}'),
                        op if LAPL.is_match(op) => &format!("{}", '\u{0394}'),
                        op => op,
                    };
                    mors.insert((cod, format!("{op}({dom})")));
                }
            }
            TyS_::Record(_) => {
                // Recurse into sub-diagram
                collect_fields(eval, &field_ty, &field_v, &full_label, obs, mors);
            }
            _ => {}
        }
    }
}

static ADD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"add-(.+)$").unwrap());
static SUBTRACT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"subtract-(.+)$").unwrap());
static MULT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"multiplication-(.+)$").unwrap());
static PARTIAL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"partial-(.+)$").unwrap());
static LAPL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"laplace-(.+)$").unwrap());
static EQ: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"eq-(.+)$").unwrap());

fn to_plain_text(tm: &TmS) -> String {
    match &**tm {
        TmS_::Var(_, name, _) => {
            let s = name.to_string();
            if s == "self" { String::new() } else { s }
        }
        TmS_::Proj(inner, _, label) => {
            let prefix = to_plain_text(inner);
            let n = label.to_string();
            if prefix.is_empty() {
                n
            } else {
                format!("{prefix}_{n}")
            }
        }
        TmS_::ObApp(op, args) => {
            let op = &format!("{op}");
            let op = match op {
                _ if ADD.is_match(op) => "+",
                _ if SUBTRACT.is_match(op) => "-",
                _ if MULT.is_match(op) => "*",
                _ if PARTIAL.is_match(op) => &format!("{}{}", '\u{2202}', '\u{209C}'),
                _ if LAPL.is_match(op) => &format!("{}", '\u{0394}'),
                _ => op,
            };
            format!("{op}({})", to_plain_text(args))
        }
        TmS_::List(args) => args.iter().map(|a| to_plain_text(a)).collect::<Vec<_>>().join(", "),
        _ => format!("{}", tm),
    }
}

// =================================================================================

/// Enables transpiling a .dbltt file to a valid Decapode
pub struct TextModel {
    pub decl: String,
    pub toplevel: Toplevel,
}

impl JuliaTranspiler for TextModel {
    /// Transpiles a .dbltt file, a valid toplevel declaration in it into a valid Julia expression. In this case, we're fixed to Decapodes.jl
    fn transpile(&self) -> String {
        let diag = match self.toplevel.declarations.get(&name_seg(self.decl.clone())) {
            Some(TopDecl::Diag(d)) => d.clone(),
            _ => panic!(),
        };

        let Ok((_, _, equations)) =
            diagram_from_diag(&self.toplevel, &diag.theory.definition, &diag)
        else {
            panic!("Error with destructuring diagram")
        };

        // the transpilation result.
        let mut out: String = Default::default();

        let mut tms: HashMap<String, String> = Default::default();
        // unhappy
        let re = regex::Regex::new(r"(.+)_(\w+)([0-9]+)$").unwrap();
        for ob in diag.over_decls {
            // I dislike indexing into the tuple's position when i could be indexing into the field of a struct, which would be more informative.
            let tm = ob.0.into_iter().map(|n| n.to_string()).collect::<Vec<_>>().join("_");
            let ty = ob.1.1.into_iter().map(|n| n.to_string()).collect::<Vec<_>>().join("_");
            // remove anonymous variables, e.g., those whose name is specified by the match expression above
            if !re.is_match(&tm) {
                tms.insert(tm, ty);
            }
        }

        let mut eqs: HashMap<String, String> = HashMap::new();
        let mut substitute: HashMap<String, String> = HashMap::new();
        for (lhs, rhs) in &equations {
            let lhs = to_plain_text(lhs);
            let rhs = to_plain_text(rhs);
            if tms.get(&lhs).is_some() && tms.get(&rhs).is_some() {
                substitute.insert(lhs.clone(), rhs.clone());
            } else {
            }
            eqs.insert(lhs, rhs);
        }

        // if there would exists an equality between two declared ojects, e.g.,
        // ```
        // a::Form0
        // b::Form0
        // a == b
        // ```
        // then instead treat the LHS object as an anonymous variable, e.g.,
        // ```
        // b::Form0
        // a == b
        // ```
        for (tm, ty) in tms.iter() {
            // if there isn't a substitution (e.g., `a == b`), then add the object as a declaration.
            if substitute.get(&tm.clone()).is_none() {
                out.push_str(&format!("\t{}::{}\n", tm, ty))
            }
        }

        for (lhs, rhs) in eqs.iter() {
            out.push_str(&format!("\n\t{} == {}", lhs, rhs));
        }

        // interpolate the diagram into a template expected by the program in the target language, e.g.,
        // insert `out` into a Decapode macro call.
        format!("@decapode begin\n{out}\nend")
    }
}
