# catcolab-documents-solid-automerge

Solid adapters for `catcolab-documents`. Core reads remain immutable snapshots;
this package supplies tracking and owner-scoped cleanup.

```ts
import {
    createAutomergeDocumentView,
    createInstanceValidationView,
} from "catcolab-documents-solid-automerge";

const document = createAutomergeDocumentView(() => props.instance.handle.automergeHandle);
const view = createInstanceValidationView(props.instance);
// Read in JSX/computations:
document().name;
view.ready();
view.data.tables;
view.data.issues;
```

`createAutomergeDocumentView` supplies patch-backed reads and is exported from the
package root. Solid is a peer dependency; install `solid-automerge` and Automerge
Repo to use the document view. Create all adapters within a Solid owner. Projected document data is read-only, not a snapshot for validation
or a writable draft.

`createInstanceValidationView` exposes original immutable results through
`view.validation` and reconciles tables/issues from the same published result for
field-grained rendering; it does not mix raw current rows with an older schema
and is not patch-backed.

Notebook adapters, notebook validation accessors and generic document helpers
currently used only by tests live in `test/utils`. The frontend schema
label/endpoint/completions integration test uses these utilities as a migration
proof, not a wholesale port of `ModelNotebookEditor`.
