//! Elaboration for frontend notebooks.
use notebook_types::v1::{ModelJudgment, Notebook};
use uuid::Uuid;

use crate::tt::{context::*, eval::*, prelude::*, stx::*, toplevel::*, val::*};

// There is some infrastructure that needs to be put into place before
// notebook elaboration can be fully successful.
//
// First of all, we need an error reporting strategy adapted for the
// notebook interface.
//
// As a first pass, we will associate the cell uuid with errors. I think
// that it makes sense to have an entirely separate file for notebook
// elaboration, mainly because the error reporting is going to be so
// different.
//
// Another reason for a separate file is that we can handle the caching
// there. Ideally, actually, the existing `Toplevel` struct should work
// just fine.
//
// It is also desirable to extract a "partial model" from a notebook.
// I think that this is possible if we simply ignore any cells that have
// errors, including cells that depend on cells that have errors.

enum Error {}

struct LocatedError {
    cell: Option<Uuid>,
    content: Error,
}

/// The current state of a notebook elaboration session.
///
/// We feed a notebook into this cell-by-cell.
pub struct Elaborator<'a> {
    toplevel: &'a Toplevel,
    current_cell: Option<Uuid>,
    context: Context,
    errors: Vec<LocatedError>,
}

struct ElaboratorCheckpoint {
    context: ContextCheckpoint,
}

impl<'a> Elaborator<'a> {
    fn notebook(&mut self, cells: &[ModelJudgment]) -> Option<(TyS, TyV)> {
        // let mut field_stxs = Vec::new();
        // let mut field_vals = Vec::new();
        todo!()
    }
}
