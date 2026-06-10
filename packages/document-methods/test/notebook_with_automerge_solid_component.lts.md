<!-- verifier:prepend-to-following -->

```tsx
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
