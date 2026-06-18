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
const transitionMorType: MorType = {
    tag: "Hom",
    content: { tag: "ModeApp", content: { modality: "SymmetricList", obType: placeObType } },
};
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
                Transition:{" "}
                <InlinePlaceListEditor placeIds={placeIds(props.transition.dom)} placeName={name} />
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

console.log(container.innerHTML);

appendCurrentInput(notebook, transition, b);
console.log(container.innerHTML);

dispose();
```

```
<section><h1>Petri net</h1><ul><li><span class="cell-label">Place: A</span></li><li><span class="cell-label">Place: B</span></li><li><span class="cell-label">Place: C</span></li><li><span class="cell-label">Transition: <span>[A<!---->]</span><span> -&gt; </span><span>[C<!---->]</span><span> fires</span></span><button aria-label="append input place"></button></li></ul></section>
<section><h1>Petri net</h1><ul><li><span class="cell-label">Place: A</span></li><li><span class="cell-label">Place: B</span></li><li><span class="cell-label">Place: C</span></li><li><span class="cell-label">Transition: <span>[A, B<!---->]</span><span> -&gt; </span><span>[C<!---->]</span><span> fires</span></span><button aria-label="append input place"></button></li></ul></section>
```

## `catcolab-documents`, generic consumer

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import {
    byMorphismType,
    byObjectType,
    CellKind,
    createBinder,
    type DocumentStore,
    type MorphismCell,
    type Notebook,
    type NotebookCell,
    type ObjectCell,
    type Shape,
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

// Bare runtime type values, declared `as const` so a transition's list-valued
// endpoint arity survives inference. A `Place` is a basic object; a transition
// is a `Hom` over a `SymmetricList` of places.
const placeObType = { tag: "Basic", content: "Object" } as const;
const transitionMorType = {
    tag: "Hom",
    content: { tag: "ModeApp", content: { modality: "SymmetricList", obType: placeObType } },
} as const;

type PlaceCell = ObjectCell<typeof placeObType>;
type TransitionCell = MorphismCell<typeof transitionMorType>;

// `cells()` yields the untyped `NotebookCell` union; these guards recover
// precise handles — a `TransitionCell`'s `dom`/`cod` are `PlaceCell[]`.
const isPlace = byObjectType(placeObType);
const isTransition = byMorphismType(transitionMorType);

function InlinePlaceListEditor(props: { places: PlaceCell[] }) {
    return <span>[{props.places.map((place) => place.name).join(", ")}]</span>;
}

function GenericTransitionCell(props: { transition: TransitionCell; appendInput: () => void }) {
    return (
        <li>
            <span class="cell-label">
                Transition: <InlinePlaceListEditor places={props.transition.dom} />
                <span> -&gt; </span>
                <InlinePlaceListEditor places={props.transition.cod} />
                <span> {props.transition.name}</span>
            </span>
            <button aria-label="append input place" onClick={props.appendInput} />
        </li>
    );
}

function GenericPetriNetCellView(props: { cell: NotebookCell; appendInput: () => void }) {
    const cell = props.cell;
    if (isTransition(cell)) {
        return <GenericTransitionCell transition={cell} appendInput={props.appendInput} />;
    }
    if (isPlace(cell)) {
        return (
            <li>
                <span class="cell-label">Place: {cell.name}</span>
            </li>
        );
    }
    if (cell.kind === CellKind.RichText) {
        return (
            <li>
                <span class="cell-label">Text: {cell.content}</span>
            </li>
        );
    }
    return null;
}

function GenericPetriNetEditor(props: {
    notebook: Notebook<Shape, SolidStoreHandle>;
    appendInput: () => void;
}) {
    return (
        <section>
            <h1>{props.notebook.name}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <GenericPetriNetCellView cell={cell} appendInput={props.appendInput} />
                    )}
                </For>
            </ul>
        </section>
    );
}

function appendGenericInput(transition: TransitionCell, place: PlaceCell) {
    transition.update({ dom: [...transition.dom, place] });
}
```

```tsx
const notebook = solidBinder.createGenericNotebook("petri-net", { name: "Petri net" });
const a = notebook.addObject(placeObType, { name: "A" });
notebook.addObject(placeObType, { name: "B" });
const c = notebook.addObject(placeObType, { name: "C" });
notebook.addMorphism(transitionMorType, { name: "fires", dom: [a], cod: [c] });

// The runtime API returns untyped handles; recover precise ones via the guards.
const transition = notebook.cells().filter(isTransition)[0]!;
const input = notebook.cells().filter(isPlace)[1]!;

const container = document.createElement("div");
document.body.appendChild(container);

const dispose = render(
    () => (
        <GenericPetriNetEditor
            notebook={notebook}
            appendInput={() => appendGenericInput(transition, input)}
        />
    ),
    container,
);

console.log(container.innerHTML);

appendGenericInput(transition, input);
console.log(container.innerHTML);

dispose();
```

```
<section><h1>Petri net</h1><ul><li><span class="cell-label">Place: A</span></li><li><span class="cell-label">Place: B</span></li><li><span class="cell-label">Place: C</span></li><li><span class="cell-label">Transition: <span>[A<!---->]</span><span> -&gt; </span><span>[C<!---->]</span><span> fires</span></span><button aria-label="append input place"></button></li></ul></section>
<section><h1>Petri net</h1><ul><li><span class="cell-label">Place: A</span></li><li><span class="cell-label">Place: B</span></li><li><span class="cell-label">Place: C</span></li><li><span class="cell-label">Transition: <span>[A, B<!---->]</span><span> -&gt; </span><span>[C<!---->]</span><span> fires</span></span><button aria-label="append input place"></button></li></ul></section>
```

## `catcolab-documents`, typed logic

The typed logic API has the same editor shape as the generic API, but the
transition type requires arrays of `Place` cells at compile time.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import {
    byMorphismType,
    byObjectType,
    CellKind,
    createBinder,
    type DocumentStore,
    type Notebook,
    type NotebookCell,
} from "catcolab-documents";
import {
    PetriNet,
    Place,
    Transition,
    type PlaceCell,
    type TransitionCell,
} from "catcolab-logics/petri-net";
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

type TypedPetriNetNotebook = Notebook<typeof PetriNet, SolidStoreHandle>;

// `cells()` yields the untyped `NotebookCell` union; `byObjectType`/
// `byMorphismType` recover precise, fully-typed handles for a given type.
const isPlace = byObjectType(Place);
const isTransition = byMorphismType(Transition);

function InlinePlaceListEditor(props: { places: PlaceCell[] }) {
    return <span>[{props.places.map((place) => place.name).join(", ")}]</span>;
}

function TypedTransitionCell(props: { transition: TransitionCell; appendInput: () => void }) {
    return (
        <li>
            <span class="cell-label">
                Transition: <InlinePlaceListEditor places={props.transition.dom} />
                <span> -&gt; </span>
                <InlinePlaceListEditor places={props.transition.cod} />
                <span> {props.transition.name}</span>
            </span>
            <button aria-label="append input place" onClick={props.appendInput} />
        </li>
    );
}

function TypedPetriNetCellView(props: { cell: NotebookCell; appendInput: () => void }) {
    const cell = props.cell;
    if (isTransition(cell)) {
        return <TypedTransitionCell transition={cell} appendInput={props.appendInput} />;
    }
    if (isPlace(cell)) {
        return (
            <li>
                <span class="cell-label">Place: {cell.name}</span>
            </li>
        );
    }
    if (cell.kind === CellKind.RichText) {
        return (
            <li>
                <span class="cell-label">Text: {cell.content}</span>
            </li>
        );
    }
    return null;
}

function TypedPetriNetEditor(props: { notebook: TypedPetriNetNotebook; appendInput: () => void }) {
    return (
        <section>
            <h1>{props.notebook.name}</h1>
            <ul>
                <For each={props.notebook.cells()}>
                    {(cell) => (
                        <TypedPetriNetCellView cell={cell} appendInput={props.appendInput} />
                    )}
                </For>
            </ul>
        </section>
    );
}
```

```tsx
const notebook = solidBinder.createNotebook(PetriNet, { name: "Petri net" });
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
            appendInput={() => transition.update({ dom: [...transition.dom, b] })}
        />
    ),
    container,
);

console.log(container.innerHTML);

transition.update({ dom: [...transition.dom, b] });
console.log(container.innerHTML);

dispose();
```

```
<section><h1>Petri net</h1><ul><li><span class="cell-label">Place: A</span></li><li><span class="cell-label">Place: B</span></li><li><span class="cell-label">Place: C</span></li><li><span class="cell-label">Transition: <span>[A<!---->]</span><span> -&gt; </span><span>[C<!---->]</span><span> fires</span></span><button aria-label="append input place"></button></li></ul></section>
<section><h1>Petri net</h1><ul><li><span class="cell-label">Place: A</span></li><li><span class="cell-label">Place: B</span></li><li><span class="cell-label">Place: C</span></li><li><span class="cell-label">Transition: <span>[A, B<!---->]</span><span> -&gt; </span><span>[C<!---->]</span><span> fires</span></span><button aria-label="append input place"></button></li></ul></section>
```
