# Notebook Types

This package defines all versions of notebook types that we have used in CatColab.

We start with `v0`, which is meant to be fully compatible with the JSON types that were stored in Automerge when they were defined in Javascript. This is the last version which does not declare its version number. Each successive version will be stored alongside a version number, and a migration function from the previous version.

Versions are identified by a single incrementing integer. Versions may import type definitions from past versions. The last version is aliased as "current". We make a sum type over all versions, that sum type will implement a `.to_current()` method which upgrades from any previous version to the current version.

Version may undergo changes in types only during development; once a version has been committed to `main`, it is frozen. This is so that we don't have to ever purge notebooks from the development server. However, adding a new version shouldn't be too onerous, so this is not a huge limitation in practice.


## Creating new versions

When adding a version which re-implements (instead of re-exports) a type from a previous version, it is important to remove the `#derive(Tsify)` statements for the old type. Otherwise Tsify will generate typescript types for both the new and old type.

Example diff in `src/v0/notebook.rs` when the `Notebook` type was re-implemented in `src/v1/notebook.rs`:

```
  use super::cell::NotebookCell;

  use serde::{Deserialize, Serialize};
  use tsify::Tsify;

- #[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
- #[tsify(into_wasm_abi, from_wasm_abi)]
+ #[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
  pub struct Notebook<T> {
      pub cells: Vec<NotebookCell<T>>,
  }
```
