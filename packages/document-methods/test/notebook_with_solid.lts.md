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

Backends can also wrap an existing document instead of a fresh notebook. This
lets storage-specific code load the document first and then hand it to the typed
notebook API.

<!-- #solid-load-existing -->

```ts
const existingSolidDoc = ModelNotebook.create(SimpleOlog, { name: "Loaded Olog" }).document;

const loadedSolidNotebook = ModelNotebook.load(SimpleOlog, existingSolidDoc, {
    backend: solidBackend,
});

createRoot(async () => {
    createEffect(() => {
        console.log("loaded notebook name:", loadedSolidNotebook.name);
    });

    await Promise.resolve();
    loadedSolidNotebook.update({ name: "Updated loaded Olog" });
    await Promise.resolve();
});
```

<!-- #solid-load-existing-output -->

```
loaded notebook name: Loaded Olog
loaded notebook name: Updated loaded Olog
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
import { type DocHandle, Repo } from "@automerge/automerge-repo";
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
    return solidAutomergeBackendFromHandle(handle)(initialDoc);
};

const solidAutomergeBackendFromHandle =
    (handle: DocHandle<ModelDocument>): NotebookBackend =>
    () => {
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

<!-- verifier:reset -->

To load an existing Automerge document, first find its handle in the repo, then
adapt that handle into a notebook backend.

<!-- #automerge-load-existing -->

```ts
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook, type NotebookBackend } from "catcolab-document-methods/future";
import { type ModelDocument } from "catcolab-document-methods";

function materializeFromLoadedAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    return getBackend(doc).materialize(objId!) as T;
}

const repo = new Repo();
const backendFromHandle =
    (handle: DocHandle<ModelDocument>): NotebookBackend =>
    () => ({
        doc: makeDocumentProjection(handle),
        change: (fn) => handle.change(fn),
        copy: (x) => materializeFromLoadedAutomerge(handle.doc(), x),
    });

const existingAutomergeHandle = repo.create<ModelDocument>(
    ModelNotebook.create(SimpleOlog, { name: "Loaded Automerge Olog" }).document,
);
const existingAutomergeUrl = existingAutomergeHandle.url;

const loadedAutomergeHandle = await repo.find<ModelDocument>(existingAutomergeUrl);
const loadedAutomergeNotebook = ModelNotebook.load(
    SimpleOlog,
    loadedAutomergeHandle.doc() as ModelDocument,
    { backend: backendFromHandle(loadedAutomergeHandle) },
);

loadedAutomergeNotebook.update({ name: "Updated loaded Automerge Olog" });
console.log("loaded automerge notebook:", loadedAutomergeNotebook.name);
```

<!-- #automerge-load-existing-output -->

```
loaded automerge notebook: Updated loaded Automerge Olog
```
