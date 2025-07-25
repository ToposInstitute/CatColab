//! The infrastructure for turning notebooks into models.
//!
//! # Terminology
//!
//! A notebook goes through three "phases" during compilation. A notebook starts
//! off as a "raw" notebook, which just the data that is stored in Automerge.
//! The notebook is then *elaborated* to notebook syntax. This process handles
//! type-checking, and builds up a report of the errors in the raw notebook.
//! Finally, the notebook syntax is *introduced* to produce a notebook value.
//! This notebook value, however, is *not* the same as the model that the notebook
//! describes.
//!
//! We understand this in the following way. Notebook syntax describes some type
//! in the context of a model of the relevant double theory. For instance, the type
//!
//! ```
//! {
//!   x : Object;
//!   y : Object;
//!   f : Morphism x y;
//!   g : Morphism y x;
//! }
//! ```
//!
//! is the type of diagrams of shape
//!
//! ```
//!   <-------
//! *          *
//!   ------->
//! ```
//!
//! Introducing a notebook produces the *initial model of the double theory that
//! is equipped with an element of the type that the notebook represents*. The
//! notebook value is the element of that type in the context of that initial
//! model.
//!
//! In general, these notebook values are essentially "directories" where the
//! leaf nodes store objects and morphisms in the initial model, so that these
//! objects may be accessed via lookup in the directory.
//!
//! After "introducing" a notebook, we may also pull out the initial model
//! itself, which is a flat structure in contrast to the notebook value. This
//! initial model is then what is used in analyses later on, such as
//! visualization or simulation.
//!
//! # Data flow
//!
//! The api is centered around a hashmap mapping refs to raw notebooks. We then
//! cache the elaboration from raw notebook to notebook syntax. In order to
//! manage this cache, alongside each raw notebook we also store the "automerge
//! heads" which serve as a "commit id" for that raw notebook and serve as an
//! indicator for when we should invalidate elaborated notebooks.
//!
//! NOTE: should we also cache the models for each elaborated notebook? As we
//! are editing only a single notebook at a time, perhaps only the model for
//! that notebook should be cached.
//!
//! NOTE: in the future, when the notebook cell that imports another notebook is
//! locked to a certain commit, then we should update this data structure to be
//! a mapping `(ref, heads) -> rawnotebook` instead of
//! `ref -> (heads, rawnotebook)`, as then we might want to keep track of the
//! elaborated notebook for multiple revisions of the same ref.
//!
//! # Operations
//!
//! From javascript, there are two operations which can be performed.
//!
//! 1. Provide updated versions of raw notebooks, alongside their automerge
//! heads. When the provided automerge heads is different from the current
//! automerge heads, we invalidate the elaborated notebook for the ref.
//!
//! 2. Ask for the model corresponding to a given ref. This will recursively
//! elaborate all referenced notebooks that have not yet been elaborated,
//! introduce the resulting syntax of the notebook for the ref, and then return
//! the model which was used to store the neutrals during introduction.
//!
//! # Identifiers
//!
//! There are (at least) three kinds of names involved in catlaborator
//!
//! 1. Class identifier. Right now, this is just a string, but later on this
//!    might get more complex. When the class source comes from catcolab, this
//!    is the ref of the notebook, which is a UUID. When the class source comes
//!    from a text file, currently this is just the name of the class in the
//!    text file, which must be unique.
//!
//! 2. Internal identifiers. These are used in the type theory.
//!
//! 3. Qualified names in models. Generators in a model are associated with the
//!    path throught the classes that one needs to take in order to get to them.
//!    This is necessary for visualization.

// pub mod api;
pub mod database;
// pub mod text_elab;
pub mod eval;
mod name;
pub mod notebook_elab;
pub mod syntax;
pub mod toplevel;
