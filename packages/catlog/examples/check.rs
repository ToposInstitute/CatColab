use catlog::tt::batch::{self, BatchOutput};

use notify::RecursiveMode;
use notify_debouncer_full::new_debouncer;
// use prelude::*;

use std::io;
use std::path::Path;
use std::sync::mpsc::channel;
use std::time::Duration;

use clap::Parser;

#[derive(Parser)]
struct Args {
    path: String,
    #[arg(short, long)]
    watch: bool,
}

fn main() -> io::Result<()> {
    let args = Args::parse();

    batch::run(&args.path, &BatchOutput::Interactive)?;
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
                    let modified =
                        es.iter().any(|e| matches!(e.kind, notify::EventKind::Modify(_)));
                    if modified {
                        batch::run(&args.path, &BatchOutput::Interactive)?;
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
