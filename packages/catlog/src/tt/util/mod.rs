/*! Various utilities that are not strictly tied to the specific type theory.

Perhaps some of these could move to [crate::zero].
*/

pub mod dtry;
pub mod idx;
pub mod pretty;
pub mod row;

pub use dtry::*;
pub use idx::*;
pub use pretty::*;
pub use row::*;
