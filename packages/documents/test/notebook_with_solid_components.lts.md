<!-- verifier:prepend-to-following -->

```tsx
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { createBinder, type DocumentStore } from "catcolab-documents";
import type { Document } from "catcolab-document-types";

type SolidStoreHandle = {
    draftDoc: Document;
    docView: Document;
    setDocView: SetStoreFunction<Document>;
    listeners: Set<() => void>;
};

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
    getDocumentView: (handle) => handle.docView,
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
    getDocumentRef: (handle) => ({ id: solidStoreIdFor(handle), version: null, server: "" }),
    getHandle: async () => ({
        tag: "Err" as const,
        content: [{ message: "This store cannot resolve references." }],
    }),
};

const solidBinder = createBinder(solidStore);

const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });
```

```tsx
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
