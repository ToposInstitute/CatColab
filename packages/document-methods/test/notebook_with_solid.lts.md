A notebook's storage is abstracted to allow plugging in custom backends. This could be used with anything but our concrete plan is to use this with Solid and Automerge.

A `NotebookBackend` is a stateless object that works on handles of its own choosing. `createHandle` creates a handle from an initial document; the other methods receive that handle back: `viewDocument` returns the read view, `changeDocument` applies a draft mutation, and the optional `copyValue` makes detached plain-JS copies of values from the backend's canonical document.

A backend is bound once with `createBinder`, which yields the notebook entry points `createNotebook`, `loadNotebook`, and `loadNotebookFromHandle`.

We can plug in Solid's reactivity by itself using `createStore` and `produce`.

<!-- verifier:prepend-to-following -->

```ts
import { createEffect, createRoot } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { SimpleOlog } from "catcolab-logics";
import { binder, createBinder, type NotebookBackend } from "catcolab-document-methods/future";
import { type ModelDocument } from "catcolab-document-methods";

type SolidStoreHandle = {
    doc: ModelDocument;
    setDoc: SetStoreFunction<ModelDocument>;
};

const solidBackend: NotebookBackend<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
        return { doc, setDoc };
    },
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => handle.setDoc(produce<ModelDocument>(fn)),
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
};

const solidBinder = createBinder(solidBackend);

const notebook = solidBinder.createNotebook(SimpleOlog, { name: "An Olog" });
```

A binder can also load an existing plain document instead of creating a fresh
notebook. The backend initializes its storage from the document.

```ts
const existingSolidDoc = binder.createNotebook(SimpleOlog, { name: "Loaded Olog" }).document;

const loadedSolidNotebook = solidBinder.loadNotebook(SimpleOlog, existingSolidDoc);

createRoot(async () => {
    createEffect(() => {
        console.log("loaded notebook name:", loadedSolidNotebook.name);
    });

    await Promise.resolve();
    loadedSolidNotebook.update({ name: "Updated loaded Olog" });
    await Promise.resolve();
});
```

```
loaded notebook name: Loaded Olog
loaded notebook name: Updated loaded Olog
```

Reads of fields, e.g. `notebook.name` are reactive.

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

```
notebook name: An Olog
notebook name: An updated Olog
```

Cell handles are reactive too. `source.name` reads from the same store, so it can be used directly inside an effect.

```ts
createRoot(async () => {
    const Type = SimpleOlog.cellTypes.Type;
    const obj = notebook.add(Type, { name: "A" });

    createEffect(() => {
        console.log("obj:", obj.name);
    });

    await Promise.resolve();
    obj.update({ name: "Updated" });
    await Promise.resolve();
});
```

```
obj: A
obj: Updated
```

Copies materialize through the backend before writing the duplicate, so Solid
store proxies do not leak into the copied cell.

```ts
createRoot(async () => {
    const Type = SimpleOlog.cellTypes.Type;
    const obj = notebook.add(Type, { name: "A" });
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
copied obj: A
obj: Updated
copied obj: Updated copied
```

<!-- verifier:reset -->

To combine Solid reactivity with Automerge, we could make custom functions or use `makeDocumentProjection` from `@automerge/automerge-repo-solid-primitives`. The backend's handle is the Automerge `DocHandle` itself: `createHandle` creates a document in the repo, and the other methods work through the handle.

<!-- verifier:prepend-to-following -->

```ts
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { createEffect, createRoot } from "solid-js";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog } from "catcolab-logics";
import { createBinder, type NotebookBackend } from "catcolab-document-methods/future";
import { type ModelDocument } from "catcolab-document-methods";

function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    return getBackend(doc).materialize(objId!) as T;
}

const repo = new Repo();

const solidAutomergeBackend: NotebookBackend<DocHandle<ModelDocument>> = {
    createHandle: (initialDoc) => repo.create<ModelDocument>(initialDoc),
    viewDocument: (handle) => makeDocumentProjection(handle),
    changeDocument: (handle, fn) => handle.change(fn),
    copyValue: (handle, value) => materializeFromAutomerge(handle.doc(), value),
};

const automergeBinder = createBinder(solidAutomergeBackend);

const notebook = automergeBinder.createNotebook(SimpleOlog, { name: "An Olog" });
```

```ts
createRoot(async () => {
    createEffect(() => {
        console.log("notebook name:", notebook.name);
    });
    await Promise.resolve();
    notebook.update({ name: "An updated Olog" });
    await Promise.resolve();
});
```

```
notebook name: An Olog
notebook name: An updated Olog
```

Copies materialize from the Automerge document itself rather than from the Solid
projection.

```ts
const copiedAutomergeObj = notebook
    .add(SimpleOlog.cellTypes.Type, { name: "Copied with Automerge" })
    .duplicate();
copiedAutomergeObj.update({ name: "Updated Automerge copy" });
console.log("automerge copy:", copiedAutomergeObj.name);
```

```
automerge copy: Updated Automerge copy
```

The notebook exposes its backend handle, so e.g. the Automerge URL is available
as `notebook.handle.url`. To work with an existing Automerge document, find its
handle in the repo and attach to it.

```ts
const sourceNotebook = automergeBinder.createNotebook(SimpleOlog, {
    name: "Loaded Automerge Olog",
});

const loadedAutomergeHandle = await repo.find<ModelDocument>(sourceNotebook.handle.url);
const loadedAutomergeNotebook = automergeBinder.loadNotebookFromHandle(
    SimpleOlog,
    loadedAutomergeHandle,
);

loadedAutomergeNotebook.update({ name: "Updated loaded Automerge Olog" });
console.log("loaded automerge notebook:", loadedAutomergeNotebook.name);
```

```
loaded automerge notebook: Updated loaded Automerge Olog
```
