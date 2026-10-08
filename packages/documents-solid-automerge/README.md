# catcolab-documents-solid-automerge

Solid adapters for `catcolab-documents`. Core reads remain immutable snapshots;
this package supplies tracking, stable cell identity and owner-scoped cleanup.

```ts
import { createNotebookValidation } from "catcolab-documents-solid-automerge";
import { createAutomergeNotebookView } from "catcolab-documents-solid-automerge/automerge";

const view = createAutomergeNotebookView(
    () => props.notebook,
    (notebook) => notebook.handle.automergeHandle,
);
const validation = createNotebookValidation(props.notebook);
// Read in JSX/computations; narrow cell.kind for kind-specific fields:
view().title;
view().cellsOf(Entity);
view().cell(cellId);
// View cell update/delete delegate to core commands without translating references.
// Notebook-level commands stay on the bound notebook:
props.notebook.add(Entity, { label: "Entity" });
```

`createNotebookView(source, project?)` is the single notebook adapter. Without
an injected projection it clones/reconciles snapshots. The `/automerge` helper
supplies patch-backed reads, without adding transport dependencies to base imports.
Solid is a peer dependency; install `solid-automerge` and Automerge Repo to use
that optional entry point. Create all adapters within a Solid owner.

`cells()`, `cell(id)` and `cellsOf(typeOrShape)` return the same cached cell views.
Reading `morphism.to?.label` tracks endpoint and target label. Core owns cell
read/decoding logic; there is no Proxy or second domain implementation here.
Wrappers retain identity across value edits/reorder. Deletion/kind/type replacement
retires a wrapper: empty reads, no-op writes; reinsertion creates a new wrapper.
Replacement/unmount releases views, never caller-owned core facades. Projected
`document` data is read-only, not a snapshot for validation or writable draft.

Validation accessors expose original immutable results. `createInstanceValidationView`
reconciles tables/issues from the same published result for field-grained rendering;
it does not mix raw current rows with an older schema and is not patch-backed.

The frontend schema label/endpoint/completions integration test is the migration
proof, not a wholesale port of `ModelNotebookEditor`. Supported cells match core:
objects, morphisms, path equations and rich text. Instantiations, contributions,
general expression endpoints and editor-variant APIs need further core support.
Rich-text editors still require an Automerge handle and cell path for splices;
whole-content cell updates are not a rich-text editor bridge.
