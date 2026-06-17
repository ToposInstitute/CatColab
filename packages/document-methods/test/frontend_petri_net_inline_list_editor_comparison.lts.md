# Frontend Petri-net inline list editor comparison

This compares a small Petri-net notebook editor where a transition has list-valued
input and output endpoints. The current frontend uses an inline object-list
editor for these endpoints; it writes endpoint values as
`App(tensor, List(SymmetricList, ...))`. The proposed APIs let the editor work
with arrays of object-cell handles and keep that encoding inside the document
methods layer.

Each example follows the same sequence: create a Petri-net notebook, add places
`A`, `B`, and `C`, add a transition `fires` from `[A]` to `[C]`, render it, then
simulate the inline list editor adding `B` to the transition's input list.

## Current frontend, reduced

The reduced current example mirrors the frontend's list endpoint storage: the
inline list editor edits the inner `List(SymmetricList, ...)`, and the morphism
editor wraps it with the tensor object operation before writing it to the raw
model declaration.

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { render } from "solid-js/web";

import { Model, Nb, type ModelDocument } from "catcolab-document-methods";
import type { Cell, ModelJudgment, MorType, Ob, ObType } from "catcolab-document-types";

type CurrentPetriNetNotebook = {
    doc: ModelDocument;
    changeDoc(fn: (doc: ModelDocument) => void): void;
};

type CurrentPlaceDecl = Extract<ModelJudgment, { tag: "object" }>;
type CurrentTransitionDecl = Extract<ModelJudgment, { tag: "morphism" }>;

type CurrentCellConstructor = {
    name: string;
    construct: () => Cell<ModelJudgment>;
};

const placeObType: ObType = { tag: "Basic", content: "Object" };
const transitionMorType: MorType = { tag: "Hom", content: placeObType };
const tensorOp = { tag: "Basic", content: "tensor" } as const;

const placeCellConstructor: CurrentCellConstructor = {
    name: "Place",
    construct: () => Nb.newFormalCell(Model.newObjectDecl(placeObType)),
};

const transitionCellConstructor: CurrentCellConstructor = {
    name: "Transition",
    construct: () => Nb.newFormalCell(Model.newMorphismDecl(transitionMorType)),
};

function createCurrentPetriNetNotebook(data: { name: string }): CurrentPetriNetNotebook {
    const initialDoc = Model.newModelDocument({ theory: "petri-net" });
    initialDoc.name = data.name;

    const [doc, setDoc] = createStore<ModelDocument>(initialDoc);
    return {
        doc,
        changeDoc: (fn) => setDoc(produce<ModelDocument>(fn)),
    };
}

function appendConstructedCell(notebook: CurrentPetriNetNotebook, cell: Cell<ModelJudgment>) {
    notebook.changeDoc((doc) => {
        Nb.appendCell(doc.notebook, cell);
    });
}

function encodePlaceIds(placeIds: string[]): Ob {
    return {
        tag: "App",
        content: {
            op: tensorOp,
            ob: {
                tag: "List",
                content: {
                    modality: "SymmetricList",
                    objects: placeIds.map((id): Ob => ({ tag: "Basic", content: id })),
                },
            },
        },
    };
}

function placeIds(ob: Ob | null): string[] {
    if (!ob) {
        return [];
    }
    switch (ob.tag) {
        case "Basic":
            return [ob.content];
        case "App":
            return placeIds(ob.content.ob);
        case "List":
            return ob.content.objects.flatMap((item) =>
                item?.tag === "Basic" ? [item.content] : [],
            );
        case "Tabulated":
            return [];
    }
}

function addCurrentPlace(
    notebook: CurrentPetriNetNotebook,
    args: { name: string },
): CurrentPlaceDecl {
    const cell = placeCellConstructor.construct();
    if (cell.tag !== "formal" || cell.content.tag !== "object") {
        throw new Error("Place constructor produced the wrong cell shape");
    }
    cell.content.name = args.name;
    appendConstructedCell(notebook, cell);
    return cell.content;
}

function addCurrentTransition(
    notebook: CurrentPetriNetNotebook,
    args: {
        name: string;
        dom: CurrentPlaceDecl[];
        cod: CurrentPlaceDecl[];
    },
): CurrentTransitionDecl {
    const cell = transitionCellConstructor.construct();
    if (cell.tag !== "formal" || cell.content.tag !== "morphism") {
        throw new Error("Transition constructor produced the wrong cell shape");
    }
    cell.content.name = args.name;
    cell.content.dom = encodePlaceIds(args.dom.map((place) => place.id));
    cell.content.cod = encodePlaceIds(args.cod.map((place) => place.id));
    appendConstructedCell(notebook, cell);
    return cell.content;
}

function updateCurrentTransition(
    notebook: CurrentPetriNetNotebook,
    transition: CurrentTransitionDecl,
    fn: (transition: CurrentTransitionDecl) => void,
) {
    notebook.changeDoc((doc) => {
        for (const judgment of Nb.getFormalContent(doc.notebook)) {
            if (judgment.tag === "morphism" && judgment.id === transition.id) {
                fn(judgment);
                return;
            }
        }
    });
}

function appendCurrentInput(
    notebook: CurrentPetriNetNotebook,
    transition: CurrentTransitionDecl,
    place: CurrentPlaceDecl,
) {
    updateCurrentTransition(notebook, transition, (transition) => {
        transition.dom = encodePlaceIds([...placeIds(transition.dom), place.id]);
    });
}

function placeName(notebook: CurrentPetriNetNotebook, id: string): string {
    for (const judgment of Nb.getFormalContent(notebook.doc.notebook)) {
        if (judgment.tag === "object" && judgment.id === id) {
            return judgment.name;
        }
    }
    return "?";
}

function InlinePlaceListEditor(props: { placeIds: string[]; placeName: (id: string) => string }) {
    return <span>[{props.placeIds.map(props.placeName).join(", ")}]</span>;
}

function CurrentTransitionCell(props: {
    notebook: CurrentPetriNetNotebook;
    transition: CurrentTransitionDecl;
    appendInput: () => void;
}) {
    const name = (id: string) => placeName(props.notebook, id);
    return (
        <li>
            <span class="cell-label">
                Transition: <InlinePlaceListEditor placeIds={placeIds(props.transition.dom)} placeName={name} />
                <span> -&gt; </span>
                <InlinePlaceListEditor placeIds={placeIds(props.transition.cod)} placeName={name} />
                <span> {props.transition.name}</span>
            </span>
            <button aria-label="append input place" onClick={props.appendInput} />
        </li>
    );
}

function CurrentPetriNetCell(props: {
    notebook: CurrentPetriNetNotebook;
    cell: Cell<ModelJudgment>;
    appendInput: () => void;
}) {
    if (props.cell.tag !== "formal") {
        return (
            <li>
                <span class="cell-label">Text: {String(props.cell.content)}</span>
            </li>
        );
    }
    switch (props.cell.content.tag) {
        case "object":
            return (
                <li>
                    <span class="cell-label">Place: {props.cell.content.name}</span>
                </li>
            );
        case "morphism":
            return (
                <CurrentTransitionCell
                    notebook={props.notebook}
                    transition={props.cell.content}
                    appendInput={props.appendInput}
                />
            );
        case "equation":
            return (
                <li>
                    <span class="cell-label">Equation: {props.cell.content.name}</span>
                </li>
            );
        case "instantiation":
            return (
                <li>
                    <span class="cell-label">Instantiate: {props.cell.content.name}</span>
                </li>
            );
    }
}

function CurrentPetriNetEditor(props: {
    notebook: CurrentPetriNetNotebook;
    appendInput: () => void;
}) {
    return (
        <section>
            <h1>{props.notebook.doc.name}</h1>
            <ul>
                <For each={Nb.getCells(props.notebook.doc.notebook)}>
                    {(cell) => (
                        <CurrentPetriNetCell
                            notebook={props.notebook}
                            cell={cell}
                            appendInput={props.appendInput}
                        />
                    )}
                </For>
            </ul>
        </section>
    );
}

function renderedCellText(container: HTMLElement): string {
    return Array.from(container.querySelectorAll(".cell-label"))
        .map((label) => label.textContent ?? "")
        .join(" | ");
}
```

```tsx
const notebook = createCurrentPetriNetNotebook({ name: "Petri net" });
const a = addCurrentPlace(notebook, { name: "A" });
const b = addCurrentPlace(notebook, { name: "B" });
const c = addCurrentPlace(notebook, { name: "C" });
const transition = addCurrentTransition(notebook, { name: "fires", dom: [a], cod: [c] });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(
    () => (
        <CurrentPetriNetEditor
            notebook={notebook}
            appendInput={() => appendCurrentInput(notebook, transition, b)}
        />
    ),
    container,
);

console.log(container.querySelector("h1")?.textContent);
console.log(renderedCellText(container));

appendCurrentInput(notebook, transition, b);
console.log(renderedCellText(container));

dispose();
```

```
Petri net
Place: A | Place: B | Place: C | Transition: [A] -> [C] fires
Place: A | Place: B | Place: C | Transition: [A, B] -> [C] fires
```

## Proposed `catcolab-documents`, generic

The generic API keeps runtime cell types (`ObType`/`MorType`) but replaces raw
notebook mutation with object and morphism cell handles. The inline list editor
can update a transition endpoint by supplying an array of object-cell handles.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import type { ModelJudgment, MorType, Ob, ObType } from "catcolab-document-types";
import {
    CellKind,
    createBinder,
    type DocumentStore,
    type GenericMorphismCell,
    type GenericNotebookCell,
    type GenericObjectCell,
} from "catcolab-documents";
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

const placeObType: ObType = { tag: "Basic", content: "Object" };
const transitionMorType: MorType = { tag: "Hom", content: placeObType };

function createGenericPetriNetNotebook(data: { name: string }) {
    return solidBinder.createGenericNotebook("petri-net", data);
}

type GenericPetriNetNotebook = ReturnType<typeof createGenericPetriNetNotebook>;

function placeIds(ob: Ob | null): string[] {
    if (!ob) {
        return [];
    }
    switch (ob.tag) {
        case "Basic":
            return [ob.content];
        case "App":
            return placeIds(ob.content.ob);
        case "List":
            return ob.content.objects.flatMap((item) =>
                item?.tag === "Basic" ? [item.content] : [],
            );
        case "Tabulated":
            return [];
    }
}

function morphismJudgment(
    document: ModelDocument,
    id: string,
): Extract<ModelJudgment, { tag: "morphism" }> | null {
    for (const cellId of document.notebook.cellOrder) {
        const cell = document.notebook.cellContents[cellId];
        if (cell?.tag === "formal" && cell.content.tag === "morphism" && cell.content.id === id) {
            return cell.content;
        }
    }
    return null;
}

function placeName(notebook: GenericPetriNetNotebook, id: string): string {
    for (const cell of notebook.cells()) {
        if (cell.kind === CellKind.Object && cell.id === id) {
            return cell.name;
        }
    }
    return "?";
}

function InlinePlaceListEditor(props: { placeIds: string[]; placeName: (id: string) => string }) {
    return <span>[{props.placeIds.map(props.placeName).join(", ")}]</span>;
}

function GenericTransitionCell(props: {
    notebook: GenericPetriNetNotebook;
    transition: GenericMorphismCell;
    appendInput: () => void;
}) {
    const name = (id: string) => placeName(props.notebook, id);
    const judgment = () => morphismJudgment(props.notebook.document, props.transition.id);
    return (
        <li>
            <span class="cell-label">
                Transition: <InlinePlaceListEditor placeIds={placeIds(judgment()?.dom ?? null)} placeName={name} />
                <span> -&gt; </span>
                <InlinePlaceListEditor placeIds={placeIds(judgment()?.cod ?? null)} placeName={name} />
                <span> {props.transition.name}</span>
            </span>
            <button aria-label="append input place" onClick={props.appendInput} />
        </li>
    );
}

function GenericPetriNetCell(props: {
    notebook: GenericPetriNetNotebook;
    cell: GenericNotebookCell;
    appendInput: () => void;
}) {
    switch (props.cell.kind) {
        case CellKind.RichText:
            return (
                <li>
                    <span class="cell-label">Text: {props.cell.content}</span>
                </li>
            );
        case CellKind.Object:
            return (
                <li>
                    <span class="cell-label">Place: {props.cell.name}</span>
                </li>
            );
        case CellKind.Morphism:
            return (
                <GenericTransitionCell
                    notebook={props.notebook}
                    transition={props.cell}
                    appendInput={props.appendInput}
                />
            );
    }
}

function GenericPetriNetEditor(props: {
    notebook: GenericPetriNetNotebook;
    appendInput: () => void;
}) {
    return (
        <section>
            <h1>{props.notebook.name}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <GenericPetriNetCell
                            notebook={props.notebook}
                            cell={cell}
                            appendInput={props.appendInput}
                        />
                    )}
                </For>
            </ul>
        </section>
    );
}

function appendGenericInput(
    transition: GenericMorphismCell,
    inputs: GenericObjectCell[],
) {
    transition.update({ dom: inputs });
}

function renderedCellText(container: HTMLElement): string {
    return Array.from(container.querySelectorAll(".cell-label"))
        .map((label) => label.textContent ?? "")
        .join(" | ");
}
```

```tsx
const notebook = createGenericPetriNetNotebook({ name: "Petri net" });
const a = notebook.addObject(placeObType, { name: "A" });
const b = notebook.addObject(placeObType, { name: "B" });
const c = notebook.addObject(placeObType, { name: "C" });
const transition = notebook.addMorphism(transitionMorType, { name: "fires", dom: [a], cod: [c] });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(
    () => (
        <GenericPetriNetEditor
            notebook={notebook}
            appendInput={() => appendGenericInput(transition, [a, b])}
        />
    ),
    container,
);

console.log(container.querySelector("h1")?.textContent);
console.log(renderedCellText(container));

appendGenericInput(transition, [a, b]);
console.log(renderedCellText(container));

dispose();
```

```
Petri net
Place: A | Place: B | Place: C | Transition: [A] -> [C] fires
Place: A | Place: B | Place: C | Transition: [A, B] -> [C] fires
```

## Proposed `catcolab-documents`, typed logic

The typed logic API has the same editor shape as the generic API, but the
transition type requires arrays of `Place` cells at compile time.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import type { ModelJudgment, Ob } from "catcolab-document-types";
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import {
    CellKind,
    createBinder,
    type DocumentStore,
    type NotebookCell,
} from "catcolab-documents";
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

function createTypedPetriNetNotebook(data: { name: string }) {
    return solidBinder.createNotebook(PetriNet, data);
}

type TypedPetriNetNotebook = ReturnType<typeof createTypedPetriNetNotebook>;
type TypedPetriNetCell = NotebookCell<typeof PetriNet>;

function placeIds(ob: Ob | null): string[] {
    if (!ob) {
        return [];
    }
    switch (ob.tag) {
        case "Basic":
            return [ob.content];
        case "App":
            return placeIds(ob.content.ob);
        case "List":
            return ob.content.objects.flatMap((item) =>
                item?.tag === "Basic" ? [item.content] : [],
            );
        case "Tabulated":
            return [];
    }
}

function morphismJudgment(
    document: ModelDocument,
    id: string,
): Extract<ModelJudgment, { tag: "morphism" }> | null {
    for (const cellId of document.notebook.cellOrder) {
        const cell = document.notebook.cellContents[cellId];
        if (cell?.tag === "formal" && cell.content.tag === "morphism" && cell.content.id === id) {
            return cell.content;
        }
    }
    return null;
}

function placeName(notebook: TypedPetriNetNotebook, id: string): string {
    for (const cell of notebook.cells()) {
        if (cell.kind === CellKind.Object && cell.id === id) {
            return cell.name;
        }
    }
    return "?";
}

function InlinePlaceListEditor(props: { placeIds: string[]; placeName: (id: string) => string }) {
    return <span>[{props.placeIds.map(props.placeName).join(", ")}]</span>;
}

function TypedTransitionCell(props: {
    notebook: TypedPetriNetNotebook;
    transition: Extract<TypedPetriNetCell, { kind: typeof CellKind.Morphism }>;
    appendInput: () => void;
}) {
    const name = (id: string) => placeName(props.notebook, id);
    const judgment = () => morphismJudgment(props.notebook.document, props.transition.id);
    return (
        <li>
            <span class="cell-label">
                Transition: <InlinePlaceListEditor placeIds={placeIds(judgment()?.dom ?? null)} placeName={name} />
                <span> -&gt; </span>
                <InlinePlaceListEditor placeIds={placeIds(judgment()?.cod ?? null)} placeName={name} />
                <span> {props.transition.name}</span>
            </span>
            <button aria-label="append input place" onClick={props.appendInput} />
        </li>
    );
}

function TypedPetriNetCellView(props: {
    notebook: TypedPetriNetNotebook;
    cell: TypedPetriNetCell;
    appendInput: () => void;
}) {
    switch (props.cell.kind) {
        case CellKind.RichText:
            return (
                <li>
                    <span class="cell-label">Text: {props.cell.content}</span>
                </li>
            );
        case CellKind.Object:
            return (
                <li>
                    <span class="cell-label">Place: {props.cell.name}</span>
                </li>
            );
        case CellKind.Morphism:
            return (
                <TypedTransitionCell
                    notebook={props.notebook}
                    transition={props.cell}
                    appendInput={props.appendInput}
                />
            );
    }
}

function TypedPetriNetEditor(props: {
    notebook: TypedPetriNetNotebook;
    appendInput: () => void;
}) {
    return (
        <section>
            <h1>{props.notebook.name}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <TypedPetriNetCellView
                            notebook={props.notebook}
                            cell={cell}
                            appendInput={props.appendInput}
                        />
                    )}
                </For>
            </ul>
        </section>
    );
}

function renderedCellText(container: HTMLElement): string {
    return Array.from(container.querySelectorAll(".cell-label"))
        .map((label) => label.textContent ?? "")
        .join(" | ");
}
```

```tsx
const notebook = createTypedPetriNetNotebook({ name: "Petri net" });
const a = notebook.add(Place, { name: "A" });
const b = notebook.add(Place, { name: "B" });
const c = notebook.add(Place, { name: "C" });
const transition = notebook.add(Transition, { name: "fires", dom: [a], cod: [c] });

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(
    () => (
        <TypedPetriNetEditor
            notebook={notebook}
            appendInput={() => transition.update({ dom: [a, b] })}
        />
    ),
    container,
);

console.log(container.querySelector("h1")?.textContent);
console.log(renderedCellText(container));

transition.update({ dom: [a, b] });
console.log(renderedCellText(container));

dispose();
```

```
Petri net
Place: A | Place: B | Place: C | Transition: [A] -> [C] fires
Place: A | Place: B | Place: C | Transition: [A, B] -> [C] fires
```
