//! Batch elaboration for DoubleTT.

use std::cell::{Ref, RefCell, RefMut};
use std::fmt::Write;
use std::ops::DerefMut;
use std::time::{Duration, Instant};
use std::{fs, io};

use fnotation::FNtnTop;
use scopeguard::guard;
use tattle::display::SourceInfo;
use tattle::{Reporter, declare_error};

use super::{
    modelgen::{ModelInstance, instance_from_def},
    text_elab::*,
    theory::std_theories,
    toplevel::*,
};
use crate::dbl::discrete::DiscreteInstanceTerm;
use crate::dbl::modal::{
    ModalInstanceBase, ModalInstanceTerm, ModalMor, ModalOb, modal_mor_as_identity,
};
use crate::dbl::model_instance::{DblModelInstance, HasInstanceTerm};
use crate::one::path::Path;
use crate::zero::{NameSegment, Namespace};

declare_error!(TOP_ERROR, "top", "an error at the top-level");

/// An enum to configure the output of batch processing.
pub enum BatchOutput {
    /// Snapshot mode: save to string.
    Snapshot(RefCell<String>),
    /// Interactive mode: print to console.
    Interactive,
}

impl BatchOutput {
    fn report(&self, reporter: &Reporter, source_info: &SourceInfo) {
        match self {
            BatchOutput::Snapshot(out) => source_info
                .extract_report_to(
                    RefMut::deref_mut(&mut out.borrow_mut()),
                    reporter.clone(),
                    tattle::display::DisplayOptions::String,
                )
                .unwrap(),
            BatchOutput::Interactive => {
                source_info
                    .extract_report_to_io(
                        &mut io::stdout(),
                        reporter.clone(),
                        tattle::display::DisplayOptions::Terminal,
                    )
                    .unwrap();
            }
        }
    }

    fn log_input(&self, src: &str, decl: &FNtnTop) {
        match self {
            BatchOutput::Snapshot(out) => {
                writeln!(out.borrow_mut(), "{}", decl.loc.slice(src)).unwrap();
            }
            BatchOutput::Interactive => {}
        }
    }

    fn declared(&self, name: NameSegment) {
        match self {
            BatchOutput::Snapshot(out) => {
                writeln!(out.borrow_mut(), "#/ declared: {}", name).unwrap();
            }
            BatchOutput::Interactive => {}
        }
    }

    fn instance_summary(&self, instance: &ModelInstance, ns: &Namespace) {
        if let BatchOutput::Snapshot(out) = self {
            let mut out = out.borrow_mut();
            match instance {
                ModelInstance::Discrete(instance) => write_instance_summary(
                    &mut out,
                    instance,
                    ns,
                    |fiber| ns.label_string(fiber),
                    |tm| format_instance_term(tm, ns),
                ),
                ModelInstance::ModalUnital(instance) => write_instance_summary(
                    &mut out,
                    instance,
                    ns,
                    |ob| format_modal_ob(ob, ns),
                    |tm| format_modal_instance_term(tm, ns),
                ),
                ModelInstance::ModalNonUnital(instance) => write_instance_summary(
                    &mut out,
                    instance,
                    ns,
                    |ob| format_modal_ob(ob, ns),
                    |tm| format_modal_instance_term(tm, ns),
                ),
            }
        }
    }

    fn instance_error(&self, msg: &str) {
        if let BatchOutput::Snapshot(out) = self {
            writeln!(out.borrow_mut(), "#/ instance generation failed: {msg}").unwrap();
        }
    }

    fn got_result(&self, result: &str) {
        match self {
            BatchOutput::Snapshot(out) => {
                writeln!(out.borrow_mut(), "#/ result: {}", result).unwrap();
            }
            BatchOutput::Interactive => {
                println!("{}", result);
            }
        }
    }

    fn display_errors(&self, should_fail: bool, reporter: &Reporter, source_info: &SourceInfo) {
        match self {
            BatchOutput::Snapshot(out) => {
                let mut out = out.borrow_mut();
                if reporter.errored() {
                    if should_fail {
                        writeln!(out, "#/ expected errors:").unwrap();
                    } else {
                        writeln!(out, "#/ unexpected errors:").unwrap();
                    }
                    let mut errors = String::new();
                    source_info
                        .extract_report_to(
                            &mut errors,
                            reporter.clone(),
                            tattle::display::DisplayOptions::String,
                        )
                        .unwrap();
                    for l in errors.lines() {
                        writeln!(out, "#/ {l}").unwrap();
                    }
                }
                writeln!(out).unwrap();
            }
            BatchOutput::Interactive => {
                if should_fail {
                    reporter.poll();
                } else {
                    self.report(reporter, source_info);
                }
            }
        }
    }

    fn record_time(&self, path: &str, elapsed_t: Duration) {
        match self {
            BatchOutput::Snapshot(_) => {}
            BatchOutput::Interactive => {
                println!(
                    "finished elaborating {} in {}ms",
                    path,
                    elapsed_t.as_micros() as f64 / 1000.0
                );
            }
        }
    }

    /// Get the result of a snapshot test.
    pub fn result<'a>(&'a self) -> Ref<'a, String> {
        match self {
            BatchOutput::Snapshot(out) => out.borrow(),
            _ => panic!("cannot get result of interactive session"),
        }
    }
}

/// Read from path and elaborate.
pub fn run(path: &str, output: &BatchOutput) -> io::Result<bool> {
    let src = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Could not read {}: {}", &path, e);
            return Ok(false);
        }
    };
    elaborate(&src, path, output)
}

/// Run the DoubleTT elaborator in batch mode.
pub fn elaborate(src: &str, path: &str, output: &BatchOutput) -> io::Result<bool> {
    let reporter = Reporter::new();
    let source_info = SourceInfo::new(Some(path), src);
    let start_t = Instant::now();
    let _unwind_guard = guard((), |_| {
        output.report(&reporter, &source_info);
    });
    let mut succeeded = true;
    let _ = TT_PARSE_CONFIG.with_parsed_top(src, reporter.clone(), |topntns| {
        let mut toplevel = Toplevel::new(std_theories());
        let mut topelab = TopElaborator::new(reporter.clone());
        for topntn in topntns.iter() {
            output.log_input(src, topntn);
            let mut should_fail = false;
            for annot in topntn.annotations {
                // We allow single_match here because in the future we might want
                // more annotations
                #[allow(clippy::single_match)]
                match annot.ast0() {
                    fnotation::Var("should_fail") => {
                        should_fail = true;
                    }
                    _ => {}
                }
            }
            if let Some(d) = topelab.elab(&toplevel, topntn) {
                if should_fail && !reporter.errored() {
                    reporter.error(
                        topntn.loc,
                        TOP_ERROR,
                        "expected a failure to elaborate".to_string(),
                    );
                } else {
                    match d {
                        TopElabResult::Declaration(name_segment, top_decl) => {
                            let is_instance = matches!(&top_decl, TopDecl::Instance(_));
                            toplevel.declarations.insert(name_segment, top_decl);
                            output.declared(name_segment);
                            if is_instance
                                && let Some(TopDecl::Instance(def)) =
                                    toplevel.declarations.get(&name_segment)
                            {
                                match instance_from_def(&toplevel, &def.theory.definition, def) {
                                    Ok((instance, ns)) => output.instance_summary(&instance, &ns),
                                    Err(msg) => output.instance_error(&msg),
                                }
                            }
                        }
                        TopElabResult::Output(s) => {
                            output.got_result(&s);
                        }
                    }
                }
            } else if !should_fail {
                succeeded = false;
            }
            output.display_errors(should_fail, &reporter, &source_info);
        }
        Some(())
    });
    output.record_time(path, Instant::now() - start_t);
    Ok(succeeded)
}

#[test]
fn snapshot_examples() {
    use similar::{ChangeTag, TextDiff};
    let mut succeeded = true;
    let base_path = std::path::Path::new("examples/tt/text");
    for f in fs::read_dir(base_path).unwrap() {
        let Ok(f) = f else {
            continue;
        };
        let os_fname = f.file_name();
        let fname = os_fname.to_str().unwrap();
        if !fname.ends_with(".dbltt") {
            continue;
        }
        let output = BatchOutput::Snapshot(RefCell::new(String::new()));
        succeeded = run(f.path().to_str().unwrap(), &output).unwrap() && succeeded;
        let golden_path = base_path.join(format!("{fname}.snapshot"));
        if matches!(std::env::var("UPDATE_SNAPSHOT"), Ok(s) if &s == "1") {
            fs::write(&golden_path, output.result().as_str()).unwrap();
        } else {
            let golden = fs::read_to_string(&golden_path).unwrap_or_default();
            let result = output.result();
            let result_str = result.as_str();
            if golden != result_str {
                succeeded = false;
                println!("failed snapshot test for {}:", base_path.join(fname).display());
                let diff = TextDiff::from_lines(golden.as_str(), result_str);

                for change in diff.iter_all_changes() {
                    match change.tag() {
                        ChangeTag::Delete => {
                            print!("- {}", change);
                        }
                        ChangeTag::Insert => {
                            print!("+ {}", change);
                        }
                        ChangeTag::Equal => {}
                    };
                }
            }
        }
    }
    assert!(succeeded);
}

/// Render an instance term for snapshot output as `f(g(base))`, with
/// `f` the outermost (last-applied) model morphism in the path.
pub(crate) fn format_instance_term(tm: &DiscreteInstanceTerm, ns: &Namespace) -> String {
    let mut s = ns.label_string(&tm.base);
    if let Path::Seq(edges) = &tm.path {
        for mor in edges.iter() {
            s = format!("{}({})", ns.label_string(mor), s);
        }
    }
    s
}

/// Writes the generators and equations of an instance, using the given
/// per-doctrine formatters for fibers and equation terms.
pub(crate) fn write_instance_summary<M: HasInstanceTerm>(
    out: &mut String,
    instance: &DblModelInstance<M>,
    ns: &Namespace,
    fmt_ob: impl Fn(&M::Ob) -> String,
    fmt_term: impl Fn(&M::Term) -> String,
) {
    let gens: Vec<_> = instance.generators().collect();
    let eqns: Vec<_> = instance.equations().collect();
    if gens.is_empty() && eqns.is_empty() {
        writeln!(out, "#/ instance has no generators or equations").unwrap();
        return;
    }
    if !gens.is_empty() {
        writeln!(out, "#/ instance generators:").unwrap();
        for (name, fiber) in &gens {
            writeln!(out, "#/   {} : {}", ns.label_string(name), fmt_ob(fiber)).unwrap();
        }
    }
    if !eqns.is_empty() {
        writeln!(out, "#/ instance equations:").unwrap();
        for (lhs, rhs) in &eqns {
            writeln!(out, "#/   {} == {}", fmt_term(lhs), fmt_term(rhs)).unwrap();
        }
    }
}

/// Renders a modal object for snapshot output: generators by name, object
/// operations as `op(inner)`, and lists as `[a, b, …]`.
pub(crate) fn format_modal_ob(ob: &ModalOb, ns: &Namespace) -> String {
    match ob {
        ModalOb::Generator(name) => ns.label_string(name),
        ModalOb::App(inner, op) => format!("{op}({})", format_modal_ob(inner, ns)),
        ModalOb::List(_, obs) => {
            let inner: Vec<_> = obs.iter().map(|ob| format_modal_ob(ob, ns)).collect();
            format!("[{}]", inner.join(", "))
        }
    }
}

/// An applicative rendering of a modal instance term, reconstructed from its
/// flat `(mor, base)` normal form so it prints back in surface syntax.
enum Rendered {
    Gen(String),
    App(String, Box<Rendered>),
    ObApp(String, Box<Rendered>),
    List(Vec<Rendered>),
}

impl Rendered {
    fn render(&self) -> String {
        match self {
            Rendered::Gen(name) => name.clone(),
            Rendered::App(name, inner) => format!("{name}({})", inner.render()),
            Rendered::ObApp(op, inner) => format!("@{op} {}", inner.render()),
            Rendered::List(items) => {
                let inner: Vec<_> = items.iter().map(Rendered::render).collect();
                format!("[{}]", inner.join(", "))
            }
        }
    }
}

/// Renders a modal instance term as e.g. `op([x, unit([])])`, re-interleaving
/// the morphism with its base (the inverse of the flattening done during
/// extraction).
pub(crate) fn format_modal_instance_term(tm: &ModalInstanceTerm, ns: &Namespace) -> String {
    apply_mor(&tm.mor, base_rendered(&tm.base, ns), ns).render()
}

fn base_rendered(base: &ModalInstanceBase, ns: &Namespace) -> Rendered {
    match base {
        ModalInstanceBase::Generator(name) => Rendered::Gen(ns.label_string(name)),
        ModalInstanceBase::List(_, bases) => {
            Rendered::List(bases.iter().map(|b| base_rendered(b, ns)).collect())
        }
        ModalInstanceBase::ObApp(op, inner) => {
            Rendered::ObApp(format!("{op}"), Box::new(base_rendered(inner, ns)))
        }
    }
}

/// Applies a model morphism to an already-rendered argument, undoing the
/// `Composite`/`List` tupling introduced by normalization: a `Composite` path
/// folds its morphisms outermost-last, and a list morphism zips into a list
/// argument.
fn apply_mor(mor: &ModalMor, arg: Rendered, ns: &Namespace) -> Rendered {
    if modal_mor_as_identity(mor).is_some() {
        return arg;
    }
    match mor {
        ModalMor::Generator(name) => Rendered::App(ns.label_string(name), Box::new(arg)),
        ModalMor::App(_, op) => Rendered::App(format!("{op}"), Box::new(arg)),
        // The functorial action of an object operation: it applies to an
        // `@op [..]` base, and the lifted morphisms act on the operation's
        // content, so we push them inside the existing wrapper rather than
        // adding another.
        ModalMor::HomApp(path, _op) => match arg {
            Rendered::ObApp(op_name, inner) => {
                Rendered::ObApp(op_name, Box::new(apply_path(path, *inner, ns)))
            }
            // Should not arise: a hom operation applies to an object-op base.
            other => other,
        },
        ModalMor::Composite(path) => apply_path(path, arg, ns),
        ModalMor::List(_, mors) => match arg {
            Rendered::List(items) if items.len() == mors.len() => {
                Rendered::List(mors.iter().zip(items).map(|(m, a)| apply_mor(m, a, ns)).collect())
            }
            // Should not arise: a list morphism always applies to a list base.
            other => other,
        },
    }
}

/// Applies a path of morphisms to a rendered argument, folding outermost-last
/// (so `[m1, m2]` renders as `m2(m1(arg))`).
fn apply_path(path: &Path<ModalOb, ModalMor>, arg: Rendered, ns: &Namespace) -> Rendered {
    match path {
        Path::Id(_) => arg,
        Path::Seq(edges) => edges.iter().fold(arg, |acc, mor| apply_mor(mor, acc, ns)),
    }
}
