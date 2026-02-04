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

use super::{text_elab::*, theory::std_theories, toplevel::*};
use crate::zero::NameSegment;

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
                writeln!(out.borrow_mut(), "#/ declared: {}", name).unwrap();
            }
            BatchOutput::Interactive => {}
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

    #[allow(unused)]
    /// Get the result of a snapshot test
    pub fn result<'a>(&'a self) -> Ref<'a, String> {
        match self {
            BatchOutput::Snapshot(out) => out.borrow(),
            _ => panic!("cannot get result of interactive session"),
        }
    }
}

/// Read from path and elaborate
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
