<!-- verifier:prepend-to-following -->

```tsx
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { createEffect, createRoot } from "solid-js";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog } from "catcolab-logics/simple-olog";
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

const solidAutomergeStore: DocumentStore<SolidAutomergeHandle> = {
    createHandle: async (initialDoc) => makeHandle(repo.create<Document>(initialDoc as Document)),
    getDocumentView: (handle) => handle.docView,
    changeDocument: (handle, fn) => handle.docHandle.change(fn),
    subscribe: (handle, callback) => {
        const onChange = () => callback();
        handle.docHandle.on("change", onChange);
        return () => handle.docHandle.off("change", onChange);
    },
    copyValue: (handle, value) => materializeFromAutomerge(handle.docHandle.doc(), value),
    getDocumentRef: (handle) => ({ id: handle.docHandle.documentId, version: null, server: "" }),
    getHandle: async () => ({
        tag: "Err" as const,
        content: [{ message: "This store cannot resolve references." }],
    }),
};

const automergeBinder = createBinder(solidAutomergeStore);
```

```tsx
import { render } from "solid-js/web";

const notebook = await automergeBinder.createNotebook(SimpleOlog, { title: "An Olog" });

function Title(props: { title: string }) {
    return <h1>{props.title}</h1>;
}

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(() => <Title title={notebook.title} />, container);
console.log(container.innerHTML);

notebook.update({ title: "A renamed Olog" });
console.log(container.innerHTML);

dispose();
```

```
<h1>An Olog</h1>
<h1>A renamed Olog</h1>
```
