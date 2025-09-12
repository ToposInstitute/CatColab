/*! Batch elaboration for doublett */
use std::cell::{Ref, RefCell, RefMut};
use std::fmt::Write;
use std::ops::DerefMut;
use std::time::{Duration, Instant};
use std::{fs, io};

use crate::zero::NameSegment;
use crate::{stdlib, tt::*};

use elab::*;
use fnotation::parser::Prec;
use fnotation::{FNtnTop, ParseConfig};
use scopeguard::guard;
use tattle::display::SourceInfo;
use tattle::{Reporter, declare_error};
use toplevel::*;

const PARSE_CONFIG: ParseConfig = ParseConfig::new(
    &[
        (":", Prec::nonassoc(20)),
        (":=", Prec::nonassoc(10)),
        ("&", Prec::lassoc(40)),
        ("*", Prec::lassoc(60)),
    ],
    &[":", ":=", "&", "Unit", "Id", "*"],
    &["type", "def", "syn", "chk", "norm"],
);

declare_error!(TOP_ERROR, "top", "an error at the top-level");

/// An enum to configure the output of batch processing
pub enum BatchOutput {
    /// Snapshot mode: save to string
    Snapshot(RefCell<String>),
    /// Interactive mode: print to console
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
                writeln!(out.borrow_mut(), "/# declared: {}", name).unwrap();
            }
            BatchOutput::Interactive => {}
        }
    }

    fn got_result(&self, result: &str) {
        match self {
            BatchOutput::Snapshot(out) => {
                writeln!(out.borrow_mut(), "/# result: {}", result).unwrap();
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
                        writeln!(out, "/# expected errors:").unwrap();
                    } else {
                        writeln!(out, "/# unexpected errors:").unwrap();
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
                        writeln!(out, "/# {l}").unwrap();
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

    #[allow(unused)]
    fn result<'a>(&'a self) -> Ref<'a, String> {
        match self {
            BatchOutput::Snapshot(out) => out.borrow(),
            _ => panic!("cannot get result of interactive session"),
        }
    }
}

/// Run the doublett elaborator in batch mode
pub fn run(path: &str, output: &BatchOutput) -> io::Result<bool> {
    let src = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Could not read {}: {}", &path, e);
            return Ok(false);
        }
    };
    let reporter = Reporter::new();
    let source_info = SourceInfo::new(Some(path), &src);
    let start_t = Instant::now();
    let _unwind_guard = guard((), |_| {
        output.report(&reporter, &source_info);
    });
    let mut succeeded = true;
    let _ = PARSE_CONFIG.with_parsed_top(&src, reporter.clone(), |topntns| {
        let mut toplevel = Toplevel::new(stdlib::th_schema());
        for topntn in topntns.iter() {
            output.log_input(&src, topntn);
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
            if let Some(d) = TopElaborator::new(&toplevel, reporter.clone()).elab(topntn) {
                if should_fail {
                    reporter.error(
                        topntn.loc,
                        TOP_ERROR,
                        "expected a failure to elaborate".to_string(),
                    );
                } else {
                    match d {
                        TopElabResult::Declaration(name_segment, top_decl) => {
                            toplevel.declarations.insert(name_segment, top_decl);
                            output.declared(name_segment);
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
    for f in fs::read_dir("examples").unwrap() {
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
        let golden_path = format!("examples/{}.snapshot", fname);
        if matches!(std::env::var("UPDATE_SNAPSHOT"), Ok(s) if &s == "1") {
            fs::write(&golden_path, output.result().as_str()).unwrap();
        } else {
            let golden = fs::read_to_string(&golden_path).unwrap_or_default();
            let result = output.result();
            let result_str = result.as_str();
            if &golden != result_str {
                succeeded = false;
                println!("failed snapshot test for examples/{fname}:");
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
