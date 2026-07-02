use indexmap::{IndexMap, IndexSet};
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;
use ustr::ustr;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::stdlib::th_multicategory;
use crate::tt::eval::Evaluator;
use crate::tt::notebook_elab::Elaborator;
use crate::tt::stx::{TmS, TmS_, TyS_};
use crate::tt::theory::{Theory, TheoryDef};
use crate::tt::toplevel::{Diag, TopDecl, Toplevel};
use crate::tt::val::{TmV, TyV, TyV_};
use crate::zero::{NameSegment, name};
use catcolab_document_types::current as nb;

static ANON: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(.+)_(\w+)([0-9]+)$").unwrap());
static FORM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"([0-9]+)-Form$").unwrap());
static DUAL_FORM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"Dual ([0-9]+)-Form").unwrap());

#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct Target {
    #[cfg_attr(feature = "serde", serde(rename = "pode"))]
    pub out: String,

    #[cfg_attr(feature = "serde", serde(rename = "constants"))]
    pub constants: Vec<String>,
}

pub trait JuliaTranspiler {
    fn transpile(&self) -> Target;
}

pub struct Decapodes {
    pub pode: TyV,
}

impl Decapodes {
    // TODO needs Result
    /// meme
    pub fn elab_and_transpile<'b>(
        model: nb::ModelDocumentContent,
        diagram: nb::DiagramDocumentContent,
        diagram_map: HashMap<String, nb::DiagramDocumentContent>,
    ) -> Target {
        let theory =
            Theory::new(name("ThMulticategory"), TheoryDef::modal_unital(th_multicategory()));
        let mut toplevel = Toplevel::new(Default::default());
        let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));

        // model
        let (_, model_ty_v) = elab.notebook(model.notebook.formal_content());

        // diagrams
        for (ref_id, diag) in diagram_map {
            let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));
            let (stx, val, _, ty) =
                elab.diagram_notebook(model_ty_v.clone(), diag.notebook.formal_content());
            toplevel.declarations.insert(
                NameSegment::Text(ustr(&ref_id)),
                TopDecl::Diag(Diag::new(theory.clone(), model_ty_v.clone(), stx, val, ty)),
            );
        }

        let mut elab = Elaborator::new(theory.clone(), &toplevel, ustr(""));
        let (_, _, _, ty_v) =
            elab.diagram_notebook(model_ty_v.clone(), diagram.notebook.formal_content());

        let pode = Decapodes { pode: ty_v };
        return pode.transpile();
    }
}

impl JuliaTranspiler for Decapodes {
    fn transpile(&self) -> Target {
        let TyV_::Record(_) = &*self.pode else {
            panic!()
        };
        let toplevel = Toplevel::new(Default::default());
        let eval = Evaluator::empty(&toplevel);
        let (self_n, eval) = eval.bind_self(self.pode.clone());
        let self_v = eval.eta_neu(&self_n, &self.pode);

        let mut subs = HashMap::new();
        let mut obs = IndexMap::new();
        let mut mors = IndexSet::new();
        let mut constants = Vec::new();
        collect_fields(&eval, &self.pode, &self_v, "", &mut obs, &mut mors, &mut subs);

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

        for (ob, ty) in obs {
            if !ANON.is_match(&format!("{ob}")) {
                out.push_str(&format!("\t{}::{}\n", ob, ty));
                if ty == "Constant" {
                    constants.push(ob);
                }
            }
        }

        for (lhs, rhs) in mors {
            out.push_str(&format!("\n\t{} == {}", lhs, rhs));
        }
        Target { out: format!("{out}"), constants }
    }
}

fn collect_fields(
    eval: &Evaluator,
    ty: &TyV,
    self_v: &TmV,
    prefix: &str,
    obs: &mut IndexMap<String, String>,
    mors: &mut IndexSet<(String, String)>,
    subs: &mut HashMap<String, String>,
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
                let p: String = path.iter().map(|(_, l)| l.to_string()).collect();
                if subs.get(&full_label).is_none() {
                    let ty = match p.to_owned() {
                        p if DUAL_FORM.is_match(&p) => {
                            let Some(dim) = DUAL_FORM.captures(&p) else {
                                continue;
                            };
                            format!("DualForm{}", &dim[1])
                        }
                        p if FORM.is_match(&p) => {
                            let Some(dim) = FORM.captures(&p) else {
                                continue;
                            };
                            format!("Form{}", &dim[1])
                        }
                        p => p,
                    };
                    obs.insert(full_label, ty);
                }
            }
            TyS_::Morphism(_, dom, cod) => {
                let dom = to_plain_text(dom);
                let cod = to_plain_text(cod);
                let op = &format!("{label}");
                if EQ.is_match(op) {
                    if obs.contains_key(&dom) && obs.contains_key(&cod) {
                        subs.insert(dom, cod);
                    } else {
                        mors.insert((cod, dom));
                    }
                } else {
                    let op = match op {
                        op if ADD.is_match(op) => "+",
                        op if SUBTRACT.is_match(op) => "-",
                        op if MULT.is_match(op) => "*",
                        op if D.is_match(op) => "d",
                        op if STAR.is_match(op) => &format!("{}", '\u{2605}'),
                        op if INV_STAR.is_match(op) => "",
                        op if LIE.is_match(op) => "L",
                        op if PARTIAL.is_match(op) => &format!("{}{}", '\u{2202}', '\u{209C}'),
                        op if LAPL.is_match(op) => &format!("{}", '\u{0394}'),
                        op => op,
                    };
                    mors.insert((cod, format!("{op}({dom})")));
                }
            }
            TyS_::Sing(_, tm) => {
                let target = to_plain_text(tm);
                subs.insert(full_label, target);
            }
            TyS_::Record(_) => {
                // Recurse into sub-diagram
                collect_fields(eval, &field_ty, &field_v, &full_label, obs, mors, subs);
            }
            // TODO whither the specializations?
            TyS_::Specialize(_, _) => {
                collect_fields(eval, &field_ty, &field_v, &full_label, obs, mors, subs);
            }
            _ => {}
        }
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
                _ if D.is_match(op) => "d",
                _ if LIE.is_match(op) => "L",
                _ if STAR.is_match(op) => &format!("{}", '\u{2605}'),
                _ if INV_STAR.is_match(op) => "", // TODO
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

// impl JuliaTranspiler for TextModel {
//     /// Transpiles a .dbltt file, a valid toplevel declaration in it into a valid Julia expression. In this case, we're fixed to Decapodes.jl
//     fn transpile(&self) -> String {
//         let diag = match self.toplevel.declarations.get(&name_seg(self.decl.clone())) {
//             Some(TopDecl::Diag(d)) => d.clone(),
//             _ => panic!(),
//         };

//         let Ok((_, _, equations)) =
//             diagram_from_diag(&self.toplevel, &diag.theory.definition, &diag)
//         else {
//             panic!("Error with destructuring diagram")
//         };

//         // the transpilation result.
//         let mut out: String = Default::default();

//         let mut tms: HashMap<String, String> = Default::default();
//         // unhappy
//         let re = Regex::new(r"(.+)_(\w+)([0-9]+)$").unwrap();
//         for ob in diag.over_decls {
//             // I dislike indexing into the tuple's position when i could be indexing into the field of a struct, which would be more informative.
//             let tm = ob.0.into_iter().map(|n| n.to_string()).collect::<Vec<_>>().join("_");
//             let ty = ob.1.1.into_iter().map(|n| n.to_string()).collect::<Vec<_>>().join("_");
//             // remove anonymous variables, e.g., those whose name is specified by the match expression above
//             if !re.is_match(&tm) {
//                 tms.insert(tm, ty);
//             }
//         }

//         let mut eqs: HashMap<String, String> = HashMap::new();
//         let mut substitute: HashMap<String, String> = HashMap::new();
//         for (lhs, rhs) in &equations {
//             let lhs = to_plain_text(lhs);
//             let rhs = to_plain_text(rhs);
//             if tms.get(&lhs).is_some() && tms.get(&rhs).is_some() {
//                 substitute.insert(lhs.clone(), rhs.clone());
//             } else {
//             }
//             eqs.insert(lhs, rhs);
//         }

//         // if there would exists an equality between two declared ojects, e.g.,
//         // ```
//         // a::Form0
//         // b::Form0
//         // a == b
//         // ```
//         // then instead treat the LHS object as an anonymous variable, e.g.,
//         // ```
//         // b::Form0
//         // a == b
//         // ```
//         for (tm, ty) in tms.iter() {
//             // if there isn't a substitution (e.g., `a == b`), then add the object as a declaration.
//             if substitute.get(&tm.clone()).is_none() {
//                 out.push_str(&format!("\t{}::{}\n", tm, ty))
//             }
//         }

//         for (lhs, rhs) in eqs.iter() {
//             out.push_str(&format!("\n\t{} == {}", lhs, rhs));
//         }

//         // interpolate the diagram into a template expected by the program in the target language, e.g.,
//         // insert `out` into a Decapode macro call.
//         format!("@decapode begin\n{out}\nend")
//     }
// }
