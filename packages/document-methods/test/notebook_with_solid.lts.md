A notebook's storage is abstracted to allow plugging in custom stores. This could be used with anything but our concrete plan is to use this with Solid and Automerge.

A `DocumentStore` is a stateless object that works on handles of its own choosing. `createHandle` creates a handle from an initial document; the other methods receive that handle back: `getReactiveProjection` returns the read view, `changeDocument` applies a draft mutation, and `copyValue` makes detached plain-JS copies of values from the store's canonical document. A store also provides `linkForHandle` (the handle's stable reference, or `undefined`) and `getHandle` (fetches a referenced handle by id, the inverse of `linkForHandle`). The shared recursive resolver uses `getHandle` to resolve an instantiation link to an elaborated model, elaborating every node against the host notebook's core theory, and rejecting when it cannot.

A store is bound once with `createBinder`, which yields the notebook entry points `createNotebook`, `loadNotebook`, and `loadNotebookFromHandle`.

We can plug in Solid's reactivity by itself using `createStore` and `produce`.

<!-- verifier:prepend-to-following -->

```ts
import { createEffect, createRoot } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder, createBinder, type DocumentStore } from "catcolab-documents";
import { type ModelDocument } from "catcolab-document-methods";

type SolidStoreHandle = {
    doc: ModelDocument;
    setDoc: SetStoreFunction<ModelDocument>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc as ModelDocument);
        return { doc, setDoc };
    },
    getReactiveProjection: (handle) => handle.doc,
    changeDocument: (handle, fn) => handle.setDoc(produce<ModelDocument>(fn)),
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    linkForHandle: () => undefined,
    getHandle: async () => undefined,
};

const solidBinder = createBinder(solidStore);

const notebook = solidBinder.createNotebook(SimpleOlog, { name: "An Olog" });
```

A binder can also load an existing plain document instead of creating a fresh
notebook. The store initializes its storage from the document.

```ts
const existingSolidDoc = binder.createNotebook(SimpleOlog, { name: "Loaded Olog" }).document;

const loadedResult = solidBinder.loadNotebook(SimpleOlog, existingSolidDoc);
console.log("issues:", loadedResult.issues ?? []);
if (!loadedResult.issues) {
    const loadedSolidNotebook = loadedResult.value;

    createRoot(async () => {
        createEffect(() => {
            console.log("loaded notebook name:", loadedSolidNotebook.name);
        });

        await Promise.resolve();
        loadedSolidNotebook.update({ name: "Updated loaded Olog" });
        await Promise.resolve();
    });
}
```

```
issues: []
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

Copies materialize through the store before writing the duplicate, so Solid
store proxies do not leak into the copied cell.

```ts
createRoot(async () => {
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

To combine Solid reactivity with Automerge, we can plug in `makeDocumentProjection` from `@automerge/automerge-repo-solid-primitives`. The store's handle bundles the Automerge `DocHandle` with the projection built from it: `createHandle` creates a document in the repo and projects it once, and the other methods work through that handle so `makeDocumentProjection` is never called again on a read.

<!-- verifier:prepend-to-following -->

```ts
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { createEffect, createRoot } from "solid-js";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, type DocumentStore } from "catcolab-documents";
import { type ModelDocument } from "catcolab-document-methods";

function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    return getBackend(doc).materialize(objId!) as T;
}

const repo = new Repo();

// The handle bundles the Automerge `DocHandle` with its reactive projection, so
// `makeDocumentProjection` is called exactly once — when the handle is minted —
// rather than on every read. `getReactiveProjection` then just returns it.
interface AutomergeHandle {
    automergeHandle: DocHandle<ModelDocument>;
    projection: ModelDocument;
}

const makeHandle = (automergeHandle: DocHandle<ModelDocument>): AutomergeHandle => ({
    automergeHandle,
    projection: makeDocumentProjection(automergeHandle),
});

const solidAutomergeStore: DocumentStore<AutomergeHandle> = {
    createHandle: (initialDoc) =>
        makeHandle(repo.create<ModelDocument>(initialDoc as ModelDocument)),
    getReactiveProjection: (handle) => handle.projection,
    changeDocument: (handle, fn) => handle.automergeHandle.change(fn),
    subscribe: (handle, callback) => {
        const onChange = () => callback();
        handle.automergeHandle.on("change", onChange);
        return () => handle.automergeHandle.off("change", onChange);
    },
    copyValue: (handle, value) => materializeFromAutomerge(handle.automergeHandle.doc(), value),
    linkForHandle: () => undefined,
    getHandle: async () => undefined,
};

const automergeBinder = createBinder(solidAutomergeStore);

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
const copiedAutomergeObj = notebook.add(Type, { name: "Copied with Automerge" }).duplicate();
copiedAutomergeObj.update({ name: "Updated Automerge copy" });
console.log("automerge copy:", copiedAutomergeObj.name);
```

```
automerge copy: Updated Automerge copy
```

The notebook exposes its store handle, so e.g. the Automerge URL is available
as `notebook.handle.url`. To work with an existing Automerge document, find its
handle in the repo and load it using `loadNotebookFromHandle`.

```ts
const sourceNotebook = automergeBinder.createNotebook(SimpleOlog, {
    name: "Automerge Olog",
});

const foundHandle = await repo.find<ModelDocument>(sourceNotebook.handle.automergeHandle.url);
const result = automergeBinder.loadNotebookFromHandle(SimpleOlog, makeHandle(foundHandle));
console.log("issues:", result.issues ?? []);
if (!result.issues) {
    const loadedNotebook = result.value;

    loadedNotebook.update({ name: `Loaded ${loadedNotebook.name}` });
    console.log("loaded automerge notebook:", loadedNotebook.name);
}
```

```
issues: []
loaded automerge notebook: Loaded Automerge Olog
```

Migration mutates the document in place, so the store handle is preserved. The
migrated notebook keeps the very same Automerge `DocHandle` and URL as before.

```ts
import { SimpleSchema } from "catcolab-logics/simple-schema";

const migratable = automergeBinder.createNotebook(SimpleOlog, { name: "To migrate" });
const urlBefore = migratable.handle.automergeHandle.url;

const migration = await migratable.migrateTo(SimpleSchema);
console.log("issues:", migration.issues ?? []);
if (!migration.issues) {
    const migrated = migration.value;

    console.log("same handle:", migrated.handle === migratable.handle);
    console.log("same url:", migrated.handle.automergeHandle.url === urlBefore);
    console.log("theory:", migrated.document.theory);
}
```

```
issues: []
same handle: true
same url: true
theory: simple-schema
```

Because the store wires `subscribe` to the `DocHandle`'s `change` event,
`notebook.onChange` fires for changes arriving from _any_ source — including
remote edits made by another collaborator on the same Automerge document. Here
we simulate a remote collaborator by editing through a second handle on the same
document found in the repo.

```ts
const shared = automergeBinder.createNotebook(SimpleOlog, { name: "Shared Olog" });

let observedChanges = 0;
const unsubscribe = shared.onChange(() => {
    observedChanges += 1;
});

const remoteHandle = await repo.find<ModelDocument>(shared.handle.automergeHandle.url);
remoteHandle.change((doc) => {
    doc.name = "Edited by a collaborator";
});

await Promise.resolve();
console.log("observed remote change:", observedChanges > 0);
console.log("name after remote edit:", shared.name);
unsubscribe();
```

```
observed remote change: true
name after remote edit: Edited by a collaborator
```
