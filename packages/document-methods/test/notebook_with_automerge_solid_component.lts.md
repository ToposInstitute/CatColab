<!-- verifier:prepend-to-following -->

```tsx
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { createEffect, createRoot } from "solid-js";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog } from "catcolab-logics/simple-olog";
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
    copyValue: (handle, value) => materializeFromAutomerge(handle.automergeHandle.doc(), value),
    linkForHandle: () => undefined,
    getHandle: async () => undefined,
};

const automergeBinder = createBinder(solidAutomergeStore);
```

```tsx
import { render } from "solid-js/web";

const notebook = automergeBinder.createNotebook(SimpleOlog, { name: "An Olog" });

function Title(props: { title: string }) {
    return <h1>{props.title}</h1>;
}

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(() => <Title title={notebook.name} />, container);
console.log(container.innerHTML);

notebook.update({ name: "A renamed Olog" });
console.log(container.innerHTML);

dispose();
```

```
<h1>An Olog</h1>
<h1>A renamed Olog</h1>
```
