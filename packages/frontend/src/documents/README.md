# Bound-document reactivity

Core `catcolab-documents` getters read immutable snapshots. They are not Solid
signals, and subscribing to the whole document does not make them field-grained.

For a bound model notebook inside a Solid owner:

```ts
const view = createAutomergeNotebookView(
    () => props.notebook,
    (notebook) => notebook.handle.automergeHandle,
);
// Read these in computations/JSX:
view().title;
view().cells();
view().cell(cellId); // stable typed cell facade; label/endpoints/etc. track fields
// Writes on view cells delegate to core commands. Notebook-level operations stay core:
view().commands.add(Entity, { label: "Entity" });
```

Import the adapter from `./notebook_view`. Narrow a cell's `kind` before reading
kind-specific properties. Endpoint references return the same wrapper as `cell()`;
reading `morphism.to?.label` tracks both the endpoint and its target label.
Read-only projected `document` data is available for editors needing raw fields.
Do not mutate that data or unwrap it to use as a writable document.

Wrappers retain identity across value edits/reorder. Deletion or kind/type
replacement retires a wrapper: reads become undefined (equation sides become
empty), writes become no-ops, and a reinserted/retyped cell gets a new wrapper.
Replacing the source or unmounting releases the adapter, not the caller-owned
core notebook. `createReconciledNotebookView` provides the same read interface
for non-Automerge stores, but clones/reconciles data on every source change.

## Migration boundary

The schema codomain/label/completions integration test exercises the adapter.
The existing `ModelNotebookEditor` has **not** been wholesale ported. Supported
bound cells currently match core: objects, morphisms, path equations, rich text.
Instantiations, contributions, general expression endpoints and editor-variant
APIs require further bound-document support before migration. Rich-text editing
must retain the Automerge handle and notebook cell path for splice operations;
`RichTextCell.update` is a whole-content command, not a rich-text editor bridge.

Validation/completions remain revisioned immutable results, not live projections.
`createInstanceValidationView` reconciles only tables/issues from the same
published validation into a frontend store. It never joins current raw rows to an
older schema; it preserves fine-grained rendering but not patch-level update cost.
