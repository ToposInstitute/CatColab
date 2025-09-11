use catlog::{stdlib, tt::*};

use elab::*;
use fnotation::ParseConfig;
use fnotation::parser::Prec;
use notify::RecursiveMode;
use notify_debouncer_full::new_debouncer;
use scopeguard::guard;
use toplevel::*;
// use prelude::*;
use tattle::display::SourceInfo;

use std::path::Path;
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};
use std::{fs, io};

use clap::Parser;
use tattle::{Reporter, declare_error};

#[derive(Parser)]
struct Args {
    path: String,
    #[arg(short, long)]
    watch: bool,
}

const PARSE_CONFIG: ParseConfig = ParseConfig::new(
    &[(":", Prec::nonassoc(20)), (":=", Prec::nonassoc(10)), ("&", Prec::lassoc(40))],
    &[":", ":=", "&", "Unit", "Id"],
    &["type", "def", "syn", "chk", "norm"],
);

declare_error!(TOP_ERROR, "top", "an error at the top-level");

fn run(path: &str) -> io::Result<()> {
    let src = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Could not read {}: {}", &path, e);
            return Ok(());
        }
    };
    let reporter = Reporter::new();
    let source_info = SourceInfo::new(Some(path), &src);
    let start_t = Instant::now();
    let _unwind_guard = guard((), |_| {
        source_info
            .extract_report_to_io(
                &mut io::stdout(),
                reporter.clone(),
                tattle::display::DisplayOptions::Terminal,
            )
            .unwrap();
    });
    let _ = PARSE_CONFIG.with_parsed_top(&src, reporter.clone(), |topntns| {
        let mut toplevel = Toplevel::new(stdlib::th_schema());
        for topntn in topntns.iter() {
            let mut should_fail = false;
            for annot in topntn.annotations {
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
                        }
                        TopElabResult::Output(s) => {
                            reporter.info(s);
                        }
                    }
                }
            } else if should_fail {
                reporter.poll();
            }
            source_info
                .extract_report_to_io(
                    &mut io::stdout(),
                    reporter.clone(),
                    tattle::display::DisplayOptions::Terminal,
                )
                .unwrap();
        }
        Some(())
    });
    source_info
        .extract_report_to_io(
            &mut io::stdout(),
            reporter.clone(),
            tattle::display::DisplayOptions::Terminal,
        )
        .unwrap();
    let elapsed_t = Instant::now() - start_t;
    println!("finished elaborating {} in {}ms", path, elapsed_t.as_micros() as f64 / 1000.0);
    Ok(())
}

fn main() -> io::Result<()> {
    let args = Args::parse();

    run(&args.path)?;
    if args.watch {
        let (tx, rx) = channel();

        let mut watcher = match new_debouncer(Duration::from_millis(20), None, tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("could not create watcher: {}", e);
                return Ok(());
            }
        };

        if let Err(e) = watcher.watch(Path::new(&args.path), RecursiveMode::Recursive) {
            eprintln!("could not watch {}: {}", &args.path, e)
        }

        for res in rx {
            match res {
                Ok(es) => {
                    let mut modified = false;
                    for e in es.iter() {
                        #[allow(clippy::single_match)]
                        match e.kind {
                            notify::EventKind::Modify(_modify_kind) => {
                                modified = true;
                            }
                            _ => {}
                        }
                    }
                    if modified {
                        run(&args.path)?;
                    }
                }
                Err(e) => {
                    eprintln!("watch error: {:?}", e)
                }
            }
        }
    }

    Ok(())
}
