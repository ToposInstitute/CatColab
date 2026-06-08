A notebook's storage is abstracted to allow plugging in custom backends. This could be used with anything but our concrete plan is to use this with Solid and Automerge.

A `NotebookBackend` is a function that takes an initial document and returns an object with a `doc` property and a `change` function.

We can plug in Solid's reactivity by itself using `createStore` and `produce`.

<!-- verifier:prepend-to-following -->

```ts
import { createEffect, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook, type NotebookBackend } from "catcolab-document-methods/future";
import { type ModelDocument } from "catcolab-document-methods";

const solidBackend: NotebookBackend = (initialDoc: ModelDocument) => {
    const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
    return { doc, change: (fn) => setDoc(produce<ModelDocument>(fn)) };
};

const notebook = ModelNotebook.create(SimpleOlog, { name: "An Olog" }, { backend: solidBackend });
```

Reads of fields, e.g. `notebook.name` are reactive.

<!-- #solid-notebook-read -->

```ts
createRoot(async () => {
    createEffect(() => {
        console.log("notebook name:", notebook.name);
    });
    // Await a no-op to let the event loop get to running the effect.
    await Promise.resolve();
    notebook.update({ name: "An updated Olog" });
    await Promise.resolve();
});
```

<!-- #solid-notebook-read-output -->

```
notebook name: An Olog
notebook name: An updated Olog
```

Cell handles are reactive too. `source.name` reads from the same store, so it can be used directly inside an effect.

<!-- #solid-cell-read -->

```ts
createRoot(async () => {
    const Type = SimpleOlog.objectTypes.Type;
    const obj = notebook.object(Type, { name: "A" });

    createEffect(() => {
        console.log("obj:", obj.name);
    });

    await Promise.resolve();
    obj.update({ name: "Updated" });
    await Promise.resolve();
});
```

<!-- #solid-cell-read-output -->

```
obj: A
obj: Updated
```

<!-- verifier:reset -->

To combine Solid reactivity with Automerge, we could make custom functions or use `makeDocumentProjection` from `@automerge/automerge-repo-solid-primitives`.

<!-- verifier:prepend-to-following -->

<!-- #automerge-notebook-read -->

```ts
import { createEffect, createRoot } from "solid-js";
import { Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook, type NotebookBackend } from "catcolab-document-methods/future";
import { type ModelDocument } from "catcolab-document-methods";

const repo = new Repo();
const solidAutomergeBackend: NotebookBackend = (initialDoc: ModelDocument) => {
    const handle = repo.create<ModelDocument>(initialDoc);
    return {
        doc: makeDocumentProjection(handle),
        change: (fn) => handle.change(fn),
    };
};

const notebook = ModelNotebook.create(
    SimpleOlog,
    { name: "An Olog" },
    { backend: solidAutomergeBackend },
);
createRoot(async () => {
    createEffect(() => {
        console.log("notebook name:", notebook.name);
    });
    // Let the initial effect run.
    await Promise.resolve();
    notebook.update({ name: "An updated Olog" });
    await Promise.resolve();
});
```

<!-- #automerge-notebook-read-output -->

```
notebook name: An Olog
notebook name: An updated Olog
```
