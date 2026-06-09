A notebook's storage is abstracted to allow plugging in custom backends. This could be used with anything but our concrete plan is to use this with Solid and Automerge.

A `NotebookBackend` is a function that takes an initial document and returns an object with a `doc` property, a `change` function, and an optional `copy` function for making detached plain-JS copies of values from the backend's canonical document.

We can plug in Solid's reactivity by itself using `createStore` and `produce`.

<!-- verifier:prepend-to-following -->

```ts
import { createEffect, createRoot } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook, type NotebookBackend } from "catcolab-document-methods/future";
import { type ModelDocument } from "catcolab-document-methods";

function removeProxyAndCopy<T>(value: T): T {
    return structuredClone(unwrap(value));
}

const solidBackend: NotebookBackend = (initialDoc: ModelDocument) => {
    const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
    return {
        doc,
        change: (fn) => setDoc(produce<ModelDocument>(fn)),
        copy: removeProxyAndCopy,
    };
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

Copies materialize through the backend before writing the duplicate, so Solid
store proxies do not leak into the copied cell.

<!-- verifier:prepend-to-following -->

```ts
createRoot(async () => {
    const Type = SimpleOlog.objectTypes.Type;
    const obj = notebook.object(Type, { name: "A" });
    const copiedObj = obj.duplicate();

    createEffect(() => {
        console.log("obj:", obj.name);
        console.log("copied obj:", copiedObj.name);
    });

    await Promise.resolve();
    obj.update({ name: "Updated" });
    await Promise.resolve();
    copiedObj.update({ name: "Updated copied" });
    await Promise.resolve();
});
```

```
obj: A
copied obj: A
obj: Updated
copied obj: Updated copied
```

<!-- verifier:reset -->

To combine Solid reactivity with Automerge, we could make custom functions or use `makeDocumentProjection` from `@automerge/automerge-repo-solid-primitives`.

<!-- verifier:prepend-to-following -->

<!-- #automerge-notebook-read -->

```ts
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { createEffect, createRoot } from "solid-js";
import { Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook, type NotebookBackend } from "catcolab-document-methods/future";
import { type ModelDocument } from "catcolab-document-methods";

function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    return getBackend(doc).materialize(objId!) as T;
}

const repo = new Repo();
const solidAutomergeBackend: NotebookBackend = (initialDoc: ModelDocument) => {
    const handle = repo.create<ModelDocument>(initialDoc);
    return {
        doc: makeDocumentProjection(handle),
        change: (fn) => handle.change(fn),
        copy: (x) => {
            const doc = handle.doc();
            return materializeFromAutomerge(doc, x);
        },
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

Copies materialize from the Automerge document itself rather than from the Solid
projection.

<!-- verifier:prepend-to-following -->

```ts
const copiedAutomergeObj = notebook
    .object(SimpleOlog.objectTypes.Type, { name: "Copied with Automerge" })
    .duplicate();
copiedAutomergeObj.update({ name: "Updated Automerge copy" });
console.log("automerge copy:", copiedAutomergeObj.name);
```

```
automerge copy: Updated Automerge copy
```

<!-- #automerge-notebook-read-output -->

```
notebook name: An Olog
notebook name: An updated Olog
```
