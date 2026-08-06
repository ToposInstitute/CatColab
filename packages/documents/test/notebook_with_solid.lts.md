A notebook's storage is abstracted to allow plugging in custom stores. This could be used with anything but our concrete plan is to use this with Solid and Automerge.

A `DocumentStore` is a stateless object that works on handles of its own choosing. `createHandle` creates a handle from an initial document; the other methods receive that handle back: `getDocumentView` returns the read-only view, `changeDocument` applies a draft mutation, `subscribe` notifies of changes (returning an unsubscribe function), and `copyValue` makes detached plain-JS copies of values from the store's canonical document. A store also provides `getDocumentRef` (the handle's stable `DocumentRef`) and `getHandle` (fetches a handle by `DocumentRef`, the inverse of `getDocumentRef`). The shared recursive resolver uses `getHandle` to resolve an instantiation to an elaborated model, elaborating every node against the host notebook's core theory, and rejecting when it cannot.

A store is bound once with `createBinder`, which yields the notebook entry points `createNotebook`, `loadNotebook`, and `loadNotebookFromRef`.

We can plug in Solid's reactivity by itself using `createStore` and `reconcile`.
The handle keeps a plain document as the source of truth and each change is
reconciled into the Solid store projection.

<!-- verifier:prepend-to-following -->

```ts
import { createEffect, createRoot } from "solid-js";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, type DocumentStore } from "catcolab-documents";
const binder = createBinder();
import type { Document } from "catcolab-document-types";

type SolidStoreHandle = {
    draftDoc: Document;
    docView: Document;
    setDocView: SetStoreFunction<Document>;
    listeners: Set<() => void>;
};

// Every store mints a stable reference for its handles; this one assigns an id
// on demand and keeps it in a WeakMap.
const solidStoreIds = new WeakMap<SolidStoreHandle, string>();
const solidStoreIdFor = (handle: SolidStoreHandle): string => {
    let id = solidStoreIds.get(handle);
    if (!id) {
        id = crypto.randomUUID();
        solidStoreIds.set(handle, id);
    }
    return id;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    async createHandle(initialDoc) {
        const draftDoc = structuredClone(initialDoc as Document);
        const [docView, setDocView] = createStore<Document>(initialDoc as Document);
        return { draftDoc, docView, setDocView, listeners: new Set() };
    },
    changeDocument: (handle, fn) => {
        fn(handle.draftDoc);
        handle.setDocView(reconcile(structuredClone(handle.draftDoc), { key: "id" }));
        for (const listener of Array.from(handle.listeners)) {
            listener();
        }
    },
    subscribe: (handle, callback) => {
        handle.listeners.add(callback);
        return () => {
            handle.listeners.delete(callback);
        };
    },
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    getDocumentView: (handle) => handle.docView,
    getDocumentRef: (handle) => ({ id: solidStoreIdFor(handle), version: null, server: "" }),
    getHandle: async () => ({
        tag: "Err" as const,
        content: [{ message: "This store cannot resolve references." }],
    }),
};

const solidBinder = createBinder(solidStore);

const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });
```

A binder can also load an existing plain document instead of creating a fresh
notebook. The store initializes its storage from the document.

```ts
const existingSolidDoc = (await binder.createNotebook(SimpleOlog, { title: "Loaded Olog" }))
    .document;

const loadedResult = await solidBinder.loadNotebook(SimpleOlog, existingSolidDoc);
console.log("tag:", loadedResult.tag);
if (loadedResult.tag === "Ok") {
    const loadedSolidNotebook = loadedResult.content;

    createRoot(async () => {
        createEffect(() => {
            console.log("loaded notebook name:", loadedSolidNotebook.title);
        });

        await Promise.resolve();
        loadedSolidNotebook.update({ title: "Updated loaded Olog" });
        await Promise.resolve();
    });
}
```

```
tag: Ok
loaded notebook name: Loaded Olog
loaded notebook name: Updated loaded Olog
```

Reads of fields, e.g. `notebook.title` are reactive.

```ts
createRoot(async () => {
    createEffect(() => {
        console.log("notebook name:", notebook.title);
    });
    // Await a no-op to let the event loop get to running the effect.
    await Promise.resolve();
    notebook.update({ title: "An updated Olog" });
    await Promise.resolve();
});
```

```
notebook name: An Olog
notebook name: An updated Olog
```

Cell handles are reactive too. `source.label` reads from the same store, so it can be used directly inside an effect.

```ts
createRoot(async () => {
    const obj = notebook.add(Type, { label: "A" });

    createEffect(() => {
        console.log("obj:", obj.label);
    });

    await Promise.resolve();
    obj.update({ label: "Updated" });
    await Promise.resolve();
});
```

```
obj: A
obj: Updated
```

Reactivity is fine-grained. Because every change is diffed into the projection
with `reconcile`, only signals for values that actually changed fire: an effect
reading one cell does not re-run when a different cell — or the notebook's own
metadata — changes, even though the notebook API rewrites whole cell objects on
`update`.

```ts
createRoot(async () => {
    const a = notebook.add(Type, { label: "A" });
    const b = notebook.add(Type, { label: "B" });

    createEffect(() => {
        console.log("a effect:", a.label);
    });
    createEffect(() => {
        console.log("b effect:", b.label);
    });

    await Promise.resolve();
    // Only the effect reading `b` re-runs; `a`'s effect stays quiet.
    b.update({ label: "B updated" });
    await Promise.resolve();
    // A notebook-level change doesn't re-run either cell effect.
    notebook.update({ title: "Renamed Olog" });
    await Promise.resolve();
    console.log("notebook:", notebook.title);
});
```

```
a effect: A
b effect: B
b effect: B updated
notebook: Renamed Olog
```

Copies materialize through the store before writing the duplicate, so Solid
store proxies do not leak into the copied cell.

```ts
createRoot(async () => {
    const obj = notebook.add(Type, { label: "A" });
    const copiedObj = obj.duplicate();

    createEffect(() => {
        console.log("obj:", obj.label);
        console.log("copied obj:", copiedObj.label);
    });

    await Promise.resolve();
    obj.update({ label: "Updated" });
    await Promise.resolve();
    copiedObj.update({ label: "Updated copied" });
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

To combine Solid reactivity with Automerge, we can plug in `makeDocumentProjection` from `@automerge/automerge-repo-solid-primitives`. The store's handle wraps the Automerge `DocHandle` alongside the Solid projection built from it: `createHandle` (and `getHandle`) create the document in the repo and build the projection once with `makeDocumentProjection`, and `getDocumentView` just returns that stable projection.

<!-- verifier:prepend-to-following -->

```ts
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { createEffect, createRoot } from "solid-js";
import { type DocHandle, type DocumentId, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, type DocumentStore } from "catcolab-documents";
import type { Document } from "catcolab-document-types";

function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    return getBackend(doc).materialize(objId!) as T;
}

const repo = new Repo();

// The handle wraps the Automerge `DocHandle` together with the Solid projection
// built from it. `createHandle` builds the projection once with
// `makeDocumentProjection`, and `getDocumentView` returns that stable projection.
type SolidAutomergeHandle = {
    docHandle: DocHandle<Document>;
    docView: Document;
};

const makeHandle = (docHandle: DocHandle<Document>): SolidAutomergeHandle => ({
    docHandle,
    docView: makeDocumentProjection(docHandle),
});

// A `DocumentRef` identifies a document by its Automerge `DocumentId`, so
// `getHandle` resolves one by `repo.find`ing it (the analog of the frontend's
// `Api.getDocHandle`), projecting it once into a handle.
const handlesByDocId = new Map<string, SolidAutomergeHandle>();

const solidAutomergeStore: DocumentStore<SolidAutomergeHandle> = {
    createHandle: async (initialDoc) => {
        const handle = makeHandle(repo.create<Document>(initialDoc as Document));
        handlesByDocId.set(handle.docHandle.documentId, handle);
        return handle;
    },
    getDocumentView: (handle) => handle.docView,
    changeDocument: (handle, fn) => handle.docHandle.change(fn),
    subscribe: (handle, callback) => {
        const onChange = () => callback();
        handle.docHandle.on("change", onChange);
        return () => handle.docHandle.off("change", onChange);
    },
    copyValue: (handle, value) => materializeFromAutomerge(handle.docHandle.doc(), value),
    getDocumentRef: (handle) => ({
        id: handle.docHandle.documentId,
        version: null,
        server: "",
    }),
    getHandle: async (ref) => {
        const cached = handlesByDocId.get(ref.id);
        if (cached) {
            return { tag: "Ok" as const, content: cached };
        }
        const docHandle = await repo.find<Document>(ref.id as DocumentId);
        const handle = makeHandle(docHandle);
        handlesByDocId.set(ref.id, handle);
        return { tag: "Ok" as const, content: handle };
    },
};

const automergeBinder = createBinder(solidAutomergeStore);

const notebook = await automergeBinder.createNotebook(SimpleOlog, { title: "An Olog" });
```

```ts
createRoot(async () => {
    createEffect(() => {
        console.log("notebook name:", notebook.title);
    });
    await Promise.resolve();
    notebook.update({ title: "An updated Olog" });
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
const copiedAutomergeObj = notebook.add(Type, { label: "Copied with Automerge" }).duplicate();
copiedAutomergeObj.update({ label: "Updated Automerge copy" });
console.log("automerge copy:", copiedAutomergeObj.label);
```

```
automerge copy: Updated Automerge copy
```

The notebook exposes its store handle, so e.g. the Automerge URL is available
as `notebook.handle.docHandle.url`. To work with an existing Automerge document,
take a reference to it with `getDocumentRef` and load it using
`loadNotebookFromRef`, which resolves the reference back to a handle through the
store's `getHandle`.

```ts
const sourceNotebook = await automergeBinder.createNotebook(SimpleOlog, {
    title: "Automerge Olog",
});

const ref = solidAutomergeStore.getDocumentRef(sourceNotebook.handle)!;
const result = await automergeBinder.loadNotebookFromRef(SimpleOlog, ref);
console.log("tag:", result.tag);
if (result.tag === "Ok") {
    const loadedNotebook = result.content;

    loadedNotebook.update({ title: `Loaded ${loadedNotebook.title}` });
    console.log("loaded automerge notebook:", loadedNotebook.title);
}
```

```
tag: Ok
loaded automerge notebook: Loaded Automerge Olog
```

Migration mutates the document in place, so the store handle is preserved. The
migrated notebook keeps the very same Automerge `DocHandle` and URL as before.

```ts
import { SimpleSchema } from "catcolab-logics/simple-schema";

const migratable = await automergeBinder.createNotebook(SimpleOlog, { title: "To migrate" });
const urlBefore = migratable.handle.docHandle.url;

const migration = await migratable.migrateTo(SimpleSchema);
console.log("tag:", migration.tag);
if (migration.tag === "Ok") {
    const migrated = migration.content;

    console.log("same handle:", migrated.handle === migratable.handle);
    console.log("same url:", migrated.handle.docHandle.url === urlBefore);
    console.log("theory:", migrated.document.theory);
}
```

```
tag: Ok
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
const shared = await automergeBinder.createNotebook(SimpleOlog, { title: "Shared Olog" });

let observedChanges = 0;
const unsubscribe = shared.onChange(() => {
    observedChanges += 1;
});

const remoteHandle = await repo.find<Document>(shared.handle.docHandle.url);
remoteHandle.change((doc) => {
    doc.name = "Edited by a collaborator";
});

await Promise.resolve();
console.log("observed remote change:", observedChanges > 0);
console.log("name after remote edit:", shared.title);
unsubscribe();
```

```
observed remote change: true
name after remote edit: Edited by a collaborator
```
