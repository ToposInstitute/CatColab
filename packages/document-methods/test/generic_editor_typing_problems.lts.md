# Typing problems in a generic Solid editor

The editor comparisons
([`olog_editor_comparison.lts.md`](./olog_editor_comparison.lts.md),
[`petri_net_editor_comparison.lts.md`](./petri_net_editor_comparison.lts.md))
build the same Solid editor on the generic and the typed logic APIs. They render
identically, so it is easy to assume the two are interchangeable. They are not:
the generic interface erases which theory a cell belongs to and which object type
an endpoint holds, and those are exactly the boundaries a Solid editor is built
out of — cell-dispatch render bodies, sub-component props, and event handlers.

Each section below takes a realistic piece of a Solid Petri-net editor, shows the
typing problem the generic interface lets through (compiling, then misbehaving at
runtime), and shows the typed logic API rejecting it at compile time.

All sections share the same Solid store boilerplate.

<!-- verifier:prepend-to-following -->

```tsx
import { For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";

import { createBinder, type DocumentStore } from "catcolab-documents";
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
```

## Problem 1: cell dispatch erases endpoint types

A Solid editor renders cells by switching on `cell.kind` over `notebook.cells()`.
With the generic API the morphism branch of `GenericNotebookCell` is
`GenericMorphismCell<any, any>`, so `cell.dom` is `any`. A developer who assumes a
transition has a single source writes `cell.dom.name` — there is no list, so it
is `undefined`, but nothing in the types objects. The editor compiles and renders
the wrong thing.

```tsx
import { CellKind, type GenericNotebook, type GenericNotebookCell } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const placeObType: ObType = { tag: "Basic", content: "Object" };
const transitionMorType: MorType = {
    tag: "Hom",
    content: { tag: "ModeApp", content: { modality: "SymmetricList", obType: placeObType } },
};

function GenericCellView(props: { cell: GenericNotebookCell }) {
    switch (props.cell.kind) {
        case CellKind.RichText:
            return <li>Text: {props.cell.content}</li>;
        case CellKind.Object:
            return <li>Place: {props.cell.name}</li>;
        case CellKind.Morphism:
            // `props.cell.dom` is `any`: this typo-level mistake (a transition's
            // source is a *list* of places, not a single named object) compiles.
            return <li>Transition source: {String(props.cell.dom.name)}</li>;
    }
}

function GenericEditor(props: { notebook: GenericNotebook<SolidStoreHandle> }) {
    return (
        <ul>
            <For each={props.notebook.cells()}>{(cell) => <GenericCellView cell={cell} />}</For>
        </ul>
    );
}

const notebook = solidBinder.createGenericNotebook("petri-net", { name: "Net" });
const a = notebook.addObject(placeObType, { name: "A" });
const c = notebook.addObject(placeObType, { name: "C" });
notebook.addMorphism(transitionMorType, { name: "fires", dom: [a], cod: [c] });

const container = document.createElement("div");
document.body.appendChild(container);
const dispose = render(() => <GenericEditor notebook={notebook} />, container);
console.log(container.innerHTML);
dispose();
```

```
<ul><li>Place: A</li><li>Place: C</li><li>Transition source: undefined</li></ul>
```

With the typed logic, `NotebookCell<typeof PetriNet>` narrows the morphism branch
to `TransitionCell`, whose `dom` is `PlaceCell[]`. The same `cell.dom.name` is a
compile error — arrays have no `name` — so the mistake never reaches the DOM.

```tsx
import { CellKind, type NotebookCell } from "catcolab-documents";
import { PetriNet } from "catcolab-logics/petri-net";

function TypedCellView(props: { cell: NotebookCell<typeof PetriNet> }) {
    switch (props.cell.kind) {
        case CellKind.RichText:
            return <li>Text: {props.cell.content}</li>;
        case CellKind.Object:
            return <li>Place: {props.cell.name}</li>;
        case CellKind.Morphism:
            // @ts-expect-error `dom` is `PlaceCell[]`; an array has no `name`.
            return <li>Transition source: {String(props.cell.dom.name)}</li>;
    }
}
```

## Problem 2: sub-component props accept the wrong theory's cells

Editors are split into per-theory sub-components. An inline place-list editor is
written `props: { places: GenericObjectCell[] }`. But every object cell of every
theory is `GenericObjectCell`, so this Petri-net component silently accepts a list
of schema entities and labels them as places.

```tsx
import { type GenericObjectCell } from "catcolab-documents";
import type { ObType } from "catcolab-document-types";

const entityObType: ObType = { tag: "Basic", content: "Entity" };

function InlinePlaceListEditor(props: { places: GenericObjectCell[] }) {
    return <span>places: [{props.places.map((place) => place.name).join(", ")}]</span>;
}

// A schema notebook, nothing to do with Petri-net places.
const schema = solidBinder.createGenericNotebook("simple-schema", { name: "Schema" });
const person = schema.addObject(entityObType, { name: "Person" });
const company = schema.addObject(entityObType, { name: "Company" });

const container = document.createElement("div");
document.body.appendChild(container);
// Entities accepted as "places" with no complaint.
const dispose = render(() => <InlinePlaceListEditor places={[person, company]} />, container);
console.log(container.innerHTML);
dispose();
```

```
<span>places: [Person, Company<!---->]</span>
```

The typed component types the prop as `PlaceCell[]`. A schema `Entity` cell is
`ObjectCell<ObjectType<"Entity">>`, not assignable to `PlaceCell`, so handing the
wrong list to the component is a compile error.

```tsx
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { type PlaceCell } from "catcolab-logics/petri-net";
import { binder } from "catcolab-documents";

function InlinePlaceListEditor(props: { places: PlaceCell[] }) {
    return <span>places: [{props.places.map((place) => place.name).join(", ")}]</span>;
}

const schema = binder.createNotebook(SimpleSchema, { name: "Schema" });
const person = schema.add(Entity, { name: "Person" });

// @ts-expect-error A `PlaceCell[]` prop rejects schema `Entity` cells.
const bad = <InlinePlaceListEditor places={[person]} />;
void bad;
```

## Problem 3: an event handler updates with a foreign cell

The append-input button from the Petri-net editor runs
`transition.update({ dom: [...transition.dom, place] })` in an `onClick`. On a
`GenericMorphismCell` the endpoint is just `GenericObjectCell[]`, so a cell from a
different notebook — a different document entirely — is accepted. It compiles; the
failure only surfaces when the editor re-renders and tries to resolve the dangling
endpoint, deep inside Solid's reactivity.

<!-- verifier:throws -->

```tsx
import { type GenericMorphismCell } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";

const placeObType: ObType = { tag: "Basic", content: "Object" };
const transitionMorType: MorType = {
    tag: "Hom",
    content: { tag: "ModeApp", content: { modality: "SymmetricList", obType: placeObType } },
};

function TransitionCellView(props: { transition: GenericMorphismCell; appendInput: () => void }) {
    return (
        <li>
            <span>Transition: {props.transition.name}</span>
            <button aria-label="append input" onClick={props.appendInput} />
        </li>
    );
}

const net = solidBinder.createGenericNotebook("petri-net", { name: "Net" });
const a = net.addObject(placeObType, { name: "A" });
const c = net.addObject(placeObType, { name: "C" });
const transition = net.addMorphism(transitionMorType, { name: "fires", dom: [a], cod: [c] });

// A place handle from a *different* notebook.
const other = solidBinder.createGenericNotebook("petri-net", { name: "Other net" });
const foreign = other.addObject(placeObType, { name: "Foreign" });

function appendInput() {
    // Accepted: `foreign` is a `GenericObjectCell`, like every object cell.
    transition.update({ dom: [...transition.dom, foreign] });
}

const container = document.createElement("div");
document.body.appendChild(container);
const dispose = render(
    () => (
        <ul>
            <TransitionCellView transition={transition} appendInput={appendInput} />
        </ul>
    ),
    container,
);

appendInput();
// Re-reading the endpoint to render it cannot find `foreign` in this document.
console.log(transition.dom.map((place) => place.name).join(", "));
dispose();
```

```
No object cell found for endpoint
```

The typed handler operates on a `TransitionCell` whose `dom` is `PlaceCell[]`, and
`update` constrains the new value to `PlaceCell[]` as well. A foreign cell is still
a `PlaceCell` here (same theory), so to show the type boundary we append a cell of
the wrong _object type_: a schema `Entity`. That is rejected at compile time.

```tsx
import { PetriNet, Place, Transition, type TransitionCell } from "catcolab-logics/petri-net";
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { binder } from "catcolab-documents";

const net = binder.createNotebook(PetriNet, { name: "Net" });
const a = net.add(Place, { name: "A" });
const c = net.add(Place, { name: "C" });
const transition: TransitionCell = net.add(Transition, { name: "fires", dom: [a], cod: [c] });

const schema = binder.createNotebook(SimpleSchema, { name: "Schema" });
const entity = schema.add(Entity, { name: "Person" });

function appendInput() {
    // @ts-expect-error A transition's `dom` is `PlaceCell[]`; an `Entity` cell is rejected.
    transition.update({ dom: [...transition.dom, entity] });
}
void appendInput;
```

## Why this matters for editors

The generic interface is the closest drop-in for today's frontend, which reads
cell types from theory metadata at runtime. But a Solid editor is a tree of
typed component boundaries: `props`, render bodies, and event handlers. The
generic handles type those boundaries as `GenericObjectCell`,
`GenericMorphismCell<any, any>`, and `any`-valued endpoints, so cross-theory
misuse, wrong-shape endpoints, and dangling references all type-check and fail
only when the component renders. The typed logic API brands each cell with its
declared type, so the editor's component boundaries enforce the theory's
structure and these mistakes become compile errors.
