# Frontend olog editor comparison

This compares the shape of a small olog notebook editor in the current
frontend-style API with the proposed `catcolab-documents` APIs. The current
example is reduced from the real frontend path: a model document is edited
through raw notebook cells, low-level model declarations, explicit endpoint
encoding, and a document mutation callback.

## Current frontend, reduced

The frontend currently derives olog cell constructors from theory metadata and
then mutates a raw `ModelDocument` notebook. In the sample body below, compare
the same sequence of work against the proposed APIs: create a notebook, add two
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
        dom: CurrentObjectDecl;
        cod: CurrentObjectDecl;
    },
): CurrentMorphismDecl {
    const cell = aspectCellConstructor.construct();
    if (cell.tag !== "formal" || cell.content.tag !== "morphism") {
        throw new Error("Aspect constructor produced the wrong cell shape");
    }
    cell.content.name = args.name;
    cell.content.dom = encodeCurrentObjectRef(args.dom);
    cell.content.cod = encodeCurrentObjectRef(args.cod);
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

function renderedCellText(container: HTMLElement): string {
    return Array.from(container.querySelectorAll("li"))
        .map((li) => li.textContent ?? "")
        .join(" | ");
}
```

```tsx
const notebook = createCurrentOlogNotebook({ name: "An Olog" });
const person = addCurrentType(notebook, { name: "Person" });
const company = addCurrentType(notebook, { name: "Company" });
addCurrentAspect(notebook, { name: "works for", dom: person, cod: company });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(() => <CurrentOlogEditor notebook={notebook} />, container);

console.log(container.querySelector("h1")?.textContent);
console.log(renderedCellText(container));

updateCurrentType(notebook, person, { name: "Employee" });
console.log(renderedCellText(container));

dispose();
```

```
An Olog
Type: Person | Type: Company | Aspect: works for
Type: Employee | Type: Company | Aspect: works for
```

## Proposed `catcolab-documents`, generic

The generic API keeps the same store boundary and cell-handle operations as the
typed API, but does not require a static logic value. Cells are created from bare
`ObType` and `MorType` values, so it is a closer replacement for code that gets
cell types from frontend theory metadata at runtime.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import type { MorType, ObType } from "catcolab-document-types";
import { CellKind, createBinder, type DocumentStore } from "catcolab-documents";
import type { ModelDocument } from "catcolab-document-methods";

type SolidStoreHandle = {
    doc: ModelDocument;
    setDoc: SetStoreFunction<ModelDocument>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
        return { doc, setDoc };
    },
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => handle.setDoc(produce<ModelDocument>(fn)),
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
};

const solidBinder = createBinder(solidStore);

const ologObjectType: ObType = { tag: "Basic", content: "Object" };
const ologAspectType: MorType = { tag: "Hom", content: ologObjectType };

function createGenericOlogNotebook(data: { name: string }) {
    return solidBinder.createGenericNotebook("simple-olog", data);
}

type GenericOlogNotebook = ReturnType<typeof createGenericOlogNotebook>;

function GenericOlogEditor(props: { notebook: GenericOlogNotebook }) {
    return (
        <section>
            <h1>{props.notebook.name}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <li>
                            {cell.kind === CellKind.RichText
                                ? `Text: ${cell.content}`
                                : cell.kind === CellKind.Object
                                  ? `Type: ${cell.name}`
                                  : `Aspect: ${cell.name}`}
                        </li>
                    )}
                </For>
            </ul>
        </section>
    );
}

function renderedCellText(container: HTMLElement): string {
    return Array.from(container.querySelectorAll("li"))
        .map((li) => li.textContent ?? "")
        .join(" | ");
}
```

```tsx
const notebook = createGenericOlogNotebook({ name: "An Olog" });
const person = notebook.addObject(ologObjectType, { name: "Person" });
const company = notebook.addObject(ologObjectType, { name: "Company" });
notebook.addMorphism(ologAspectType, { name: "works for", dom: person, cod: company });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(() => <GenericOlogEditor notebook={notebook} />, container);

console.log(container.querySelector("h1")?.textContent);
console.log(renderedCellText(container));

person.update({ name: "Employee" });
console.log(renderedCellText(container));

dispose();
```

```
An Olog
Type: Person | Type: Company | Aspect: works for
Type: Employee | Type: Company | Aspect: works for
```

## Proposed `catcolab-documents`, typed logic

With the proposed package, the store boundary is explicit and reusable. The
editor receives a typed notebook handle instead of raw notebook data plus a
separate mutation callback. The sample body follows the same sequence as above,
but creating cells, wiring endpoints, and updating the first type all go through
the logic's typed cell values.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { CellKind, createBinder, type DocumentStore } from "catcolab-documents";
import type { ModelDocument } from "catcolab-document-methods";

type SolidStoreHandle = {
    doc: ModelDocument;
    setDoc: SetStoreFunction<ModelDocument>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
        return { doc, setDoc };
    },
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => handle.setDoc(produce<ModelDocument>(fn)),
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
};

const solidBinder = createBinder(solidStore);

function createProposedOlogNotebook(data: { name: string }) {
    return solidBinder.createNotebook(SimpleOlog, data);
}

type ProposedOlogNotebook = ReturnType<typeof createProposedOlogNotebook>;

function ProposedOlogEditor(props: { notebook: ProposedOlogNotebook }) {
    return (
        <section>
            <h1>{props.notebook.name}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <li>
                            {cell.kind === CellKind.RichText
                                ? `Text: ${cell.content}`
                                : cell.kind === CellKind.Object
                                  ? `Type: ${cell.name}`
                                  : `Aspect: ${cell.name}`}
                        </li>
                    )}
                </For>
            </ul>
        </section>
    );
}

function renderedCellText(container: HTMLElement): string {
    return Array.from(container.querySelectorAll("li"))
        .map((li) => li.textContent ?? "")
        .join(" | ");
}
```

```tsx
const notebook = createProposedOlogNotebook({ name: "An Olog" });
const person = notebook.add(Type, { name: "Person" });
const company = notebook.add(Type, { name: "Company" });
notebook.add(Aspect, { name: "works for", dom: person, cod: company });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(() => <ProposedOlogEditor notebook={notebook} />, container);

console.log(container.querySelector("h1")?.textContent);
console.log(renderedCellText(container));

person.update({ name: "Employee" });
console.log(renderedCellText(container));

dispose();
```

```
An Olog
Type: Person | Type: Company | Aspect: works for
Type: Employee | Type: Company | Aspect: works for
```
