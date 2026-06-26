<!-- verifier:prepend-to-following -->

```tsx
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { createBinder, type DocumentStore } from "catcolab-documents";
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
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => handle.setDoc(produce<ModelDocument>(fn)),
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    linkForHandle: () => undefined,
    getHandle: () => undefined,
    coreTheoryFor: () => undefined,
};

const solidBinder = createBinder(solidStore);

const notebook = solidBinder.createNotebook(SimpleOlog, { name: "An Olog" });
```

```tsx
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
