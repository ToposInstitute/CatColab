# Frontend olog editor comparison

This compares the shape of a small olog notebook editor in the current
frontend-style API with the `catcolab-documents` APIs. The current
example is reduced from the real frontend path: a model document is edited
through raw notebook cells, low-level model declarations, explicit endpoint
encoding, and a document mutation callback.

## Current frontend, reduced

The frontend currently derives olog cell constructors from theory metadata and
then mutates a raw `Document` notebook. In the sample body below, compare
the same sequence of work against the document APIs: create a notebook, add two
types and one aspect, render, then rename the first type.

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { render } from "solid-js/web";

import { Model, Nb, type ModelDocument } from "catcolab-document-methods";
import type { Cell, ModelJudgment, MorType, Ob, ObType } from "catcolab-document-types";

type CurrentOlogNotebook = {
    doc: ModelDocument;
    changeDoc(fn: (doc: ModelDocument) => void): void;
};

type CurrentObjectDecl = Extract<ModelJudgment, { tag: "object" }>;
type CurrentMorphismDecl = Extract<ModelJudgment, { tag: "morphism" }>;

type CurrentCellConstructor = {
    name: string;
    construct: () => Cell<ModelJudgment>;
};

const ologObjectType: ObType = { tag: "Basic", content: "Object" };
const ologAspectType: MorType = { tag: "Hom", content: ologObjectType };

const typeCellConstructor: CurrentCellConstructor = {
    name: "Type",
    construct: () => Nb.newFormalCell(Model.newObjectDecl(ologObjectType)),
};

const aspectCellConstructor: CurrentCellConstructor = {
    name: "Aspect",
    construct: () => Nb.newFormalCell(Model.newMorphismDecl(ologAspectType)),
};

function createCurrentOlogNotebook(data: { name: string }): CurrentOlogNotebook {
    const initialDoc = Model.newModelDocument({ theory: "simple-olog" });
    initialDoc.name = data.name;

    const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
    return {
        doc,
        changeDoc: (fn) => setDoc(produce<ModelDocument>(fn)),
    };
}

function appendConstructedCell(notebook: CurrentOlogNotebook, cell: Cell<ModelJudgment>) {
    notebook.changeDoc((doc) => {
        Nb.appendCell(doc.notebook, cell);
    });
}

function encodeCurrentObjectRef(object: CurrentObjectDecl): Ob {
    return { tag: "Basic", content: object.id };
}

function addCurrentType(notebook: CurrentOlogNotebook, args: { name: string }): CurrentObjectDecl {
    const cell = typeCellConstructor.construct();
    if (cell.tag !== "formal" || cell.content.tag !== "object") {
        throw new Error("Type constructor produced the wrong cell shape");
    }
    cell.content.name = args.name;
    appendConstructedCell(notebook, cell);
    return cell.content;
}

function addCurrentAspect(
    notebook: CurrentOlogNotebook,
    args: {
        name: string;
        from: CurrentObjectDecl;
        to: CurrentObjectDecl;
    },
): CurrentMorphismDecl {
    const cell = aspectCellConstructor.construct();
    if (cell.tag !== "formal" || cell.content.tag !== "morphism") {
        throw new Error("Aspect constructor produced the wrong cell shape");
    }
    cell.content.name = args.name;
    cell.content.dom = encodeCurrentObjectRef(args.from);
    cell.content.cod = encodeCurrentObjectRef(args.to);
    appendConstructedCell(notebook, cell);
    return cell.content;
}

function updateCurrentType(
    notebook: CurrentOlogNotebook,
    object: CurrentObjectDecl,
    args: { name: string },
) {
    notebook.changeDoc((doc) => {
        for (const judgment of Nb.getFormalContent(doc.notebook)) {
            if (judgment.id === object.id) {
                judgment.name = args.name;
                return;
            }
        }
    });
}

function currentJudgmentLabel(judgment: ModelJudgment): string {
    switch (judgment.tag) {
        case "object":
            return "Type";
        case "morphism":
            return "Aspect";
        case "instantiation":
            return "Instantiate";
        case "equation":
            return "Equation";
    }
}

function CurrentOlogEditor(props: { notebook: CurrentOlogNotebook }) {
    return (
        <section>
            <h1>{props.notebook.doc.name}</h1>
            <ul>
                <For each={Nb.getCells(props.notebook.doc.notebook)}>
                    {(cell) => (
                        <li>
                            {cell.tag === "formal"
                                ? `${currentJudgmentLabel(cell.content)}: ${cell.content.name}`
                                : `Text: ${String(cell.content)}`}
                        </li>
                    )}
                </For>
            </ul>
        </section>
    );
}
```

```tsx
const notebook = createCurrentOlogNotebook({ name: "An Olog" });
const person = addCurrentType(notebook, { name: "Person" });
const company = addCurrentType(notebook, { name: "Company" });
addCurrentAspect(notebook, { name: "works for", from: person, to: company });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(() => <CurrentOlogEditor notebook={notebook} />, container);

console.log(container.innerHTML);

updateCurrentType(notebook, person, { name: "Employee" });
console.log(container.innerHTML);

dispose();
```

```
<section><h1>An Olog</h1><ul><li>Type: Person</li><li>Type: Company</li><li>Aspect: works for</li></ul></section>
<section><h1>An Olog</h1><ul><li>Type: Employee</li><li>Type: Company</li><li>Aspect: works for</li></ul></section>
```

## `catcolab-documents`, generic

The generic API keeps the same store boundary and cell-handle operations as the
typed API. A shape is defined inline from the cell types, so this is a close
replacement for code that builds a shape from frontend theory metadata; the
editor itself is written against the generic `Notebook` interface.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import {
    CellKind,
    createBinder,
    defineMorphism,
    defineObject,
    defineShape,
    type DocumentStore,
    type Notebook,
    type Shape,
} from "catcolab-documents";
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

const ologObjectType = defineObject({ tag: "Basic", content: "Object" });
const ologAspectType = defineMorphism({
    tag: "Hom",
    content: ologObjectType.obType,
});

const Olog = defineShape({
    objects: [ologObjectType],
    morphisms: [ologAspectType],
});

function GenericOlogEditor(props: { notebook: Notebook<Shape, SolidStoreHandle> }) {
    return (
        <section>
            <h1>{props.notebook.title}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <li>
                            {cell.kind === CellKind.RichText
                                ? `Text: ${cell.content}`
                                : cell.kind === CellKind.Object
                                  ? `Type: ${cell.label}`
                                  : `Aspect: ${cell.label}`}
                        </li>
                    )}
                </For>
            </ul>
        </section>
    );
}
```

```tsx
import { SimpleOlog, Aspect, Type } from "catcolab-logics/simple-olog";
const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });
const person = notebook.add(Type, { label: "Person" });
const company = notebook.add(Type, { label: "Company" });
notebook.add(ologAspectType, { label: "works for", from: person, to: company });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(() => <GenericOlogEditor notebook={notebook} />, container);

console.log(container.innerHTML);

person.update({ label: "Employee" });
console.log(container.innerHTML);

dispose();
```

```
<section><h1>An Olog</h1><ul><li>Type: Person</li><li>Type: Company</li><li>Aspect: works for</li></ul></section>
<section><h1>An Olog</h1><ul><li>Type: Employee</li><li>Type: Company</li><li>Aspect: works for</li></ul></section>
```

## `catcolab-documents`, typed logic

With `catcolab-documents`, the store boundary is explicit and reusable. The
editor receives a typed notebook handle instead of raw notebook data plus a
separate mutation callback. The sample body follows the same sequence as above,
but creating cells, wiring endpoints, and updating the first type all go through
the logic's typed cell values.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { CellKind, createBinder, type DocumentStore, type Notebook } from "catcolab-documents";
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

type TypedOlogNotebook = Notebook<typeof SimpleOlog, SolidStoreHandle>;

function TypedOlogEditor(props: { notebook: TypedOlogNotebook }) {
    return (
        <section>
            <h1>{props.notebook.title}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <li>
                            {cell.kind === CellKind.RichText
                                ? `Text: ${cell.content}`
                                : cell.kind === CellKind.Object
                                  ? `Type: ${cell.label}`
                                  : `Aspect: ${cell.label}`}
                        </li>
                    )}
                </For>
            </ul>
        </section>
    );
}
```

```tsx
const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });
const person = notebook.add(Type, { label: "Person" });
const company = notebook.add(Type, { label: "Company" });
notebook.add(Aspect, { label: "works for", from: person, to: company });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(() => <TypedOlogEditor notebook={notebook} />, container);

console.log(container.innerHTML);

person.update({ label: "Employee" });
console.log(container.innerHTML);

dispose();
```

```
<section><h1>An Olog</h1><ul><li>Type: Person</li><li>Type: Company</li><li>Aspect: works for</li></ul></section>
<section><h1>An Olog</h1><ul><li>Type: Employee</li><li>Type: Company</li><li>Aspect: works for</li></ul></section>
```
