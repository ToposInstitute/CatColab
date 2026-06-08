use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

use crate::tt::modelgen::diagram_from_diag;
use crate::tt::stx::{TmS, TmS_};
use crate::tt::toplevel::{TopDecl, Toplevel};
use crate::zero::name_seg;

/// Enables transpiling a .dbltt file to a valid Decapode
pub struct JuliaTranspiler {}

impl JuliaTranspiler {
    /// Transpiles a .dbltt file, a valid toplevel declaration in it into a valid Julia expression. In this case, we're fixed to Decapodes.jl
    pub fn transpile(src: &str, decl_name: &str, elab: impl Fn(&str) -> Toplevel) -> String {
        let toplevel = elab(&src);
        let diag = match toplevel.declarations.get(&name_seg(decl_name)) {
            Some(TopDecl::Diag(d)) => d.clone(),
            _ => panic!("expected {decl_name} to be a diagram declaration"),
        };

        let Ok((_, _, equations)) = diagram_from_diag(&toplevel, &diag.theory.definition, &diag)
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
            let lhs = to_plain(lhs);
            let rhs = to_plain(rhs);
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

static ADD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"add_(.+)$").unwrap());
static SUBTRACT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"sub_(.+)$").unwrap());
static MULT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"mult_(.+)$").unwrap());
static PARTIAL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"partial_(.+)$").unwrap());
static LAPL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"lapl_(.+)$").unwrap());

fn to_plain(tm: &TmS) -> String {
    match &**tm {
        TmS_::Var(_, name, _) => {
            let s = name.to_string();
            if s == "self" { String::new() } else { s }
        }
        TmS_::Proj(inner, name, _) => {
            let prefix = to_plain(inner);
            let n = name.to_string();
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
            format!("{op}({})", to_plain(args))
        }
        TmS_::List(args) => args.iter().map(|a| to_plain(a)).collect::<Vec<_>>().join(", "),
        _ => format!("{}", tm),
    }
}
