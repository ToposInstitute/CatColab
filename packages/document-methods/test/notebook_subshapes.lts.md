# Interactive components over any notebook

A shape declares the object and morphism types a notebook is built from, and
`cells()` is typed precisely by that shape: a consumer that names a shape must
handle every cell type the shape implies. A reusable component therefore does
not pin itself to one theory's shape; it is written against the generic
`Notebook` interface, whose `cells()` yields the widest `NotebookCell` union. It
stays fully interactive — it reads cells with `byObjectType`/`byMorphismType`,
edits them with `update`, and adds new ones with `addObject`/`addMorphism` — and
because a notebook over any shape is assignable to the generic `Notebook`, the
component accepts a notebook of any theory.

<!-- verifier:prepend-to-following -->

```ts
import { binder, byObjectType, defineShape, type Notebook } from "catcolab-documents";
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
```

`renamePlaces` is written against the generic `Notebook`. It filters the
notebook's places, renames each, and adds one — selecting the cells it handles
with `byObjectType`, ignoring the rest.

<!-- verifier:prepend-to-following -->

```ts
function renamePlaces(notebook: Notebook): string[] {
    for (const place of notebook.cells().filter(byObjectType(Place))) {
        place.update({ name: place.name.toUpperCase() });
    }
    notebook.addObject(Place, { name: "new" });
    return notebook
        .cells()
        .filter(byObjectType(Place))
        .map((place) => place.name);
}
```

A full Petri-net notebook — whose shape has both `Place` and `Transition` — is
accepted wherever a generic `Notebook` is expected.

<!-- verifier:prepend-to-following -->

```ts
const net = binder.createNotebook(PetriNet, { name: "Net" });
const a = net.add(Place, { name: "a" });
const c = net.add(Place, { name: "c" });
const transition = net.add(Transition, { name: "fires", dom: [a], cod: [c] });
```

```ts
console.log(renamePlaces(net).join(", "));
```

```
A, C, new
```

## Mistakes caught at compile time

Reading cells through `cells()` gives untyped handles, and the component
boundaries above are typed, so the classic editor mistakes are compile errors.

### A list endpoint read as a single cell

A morphism cell's `dom` is either a single cell or a list, so reading a field
like `.name` off it directly is a type error.

```ts
import { CellKind } from "catcolab-documents";

for (const cell of net.cells()) {
    if (cell.kind === CellKind.Morphism) {
        // @ts-expect-error `dom` is a single cell or a list; a list has no `name`.
        console.log(cell.dom.name);
    }
}
```

### A sub-component prop of the wrong theory

A list editor written for places types its prop as `PlaceCell[]`. A schema
`Entity` cell is `ObjectCell` of a different object type, so handing it over is
rejected.

```ts
import type { PlaceCell } from "catcolab-logics/petri-net";
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";

function renderPlaces(places: PlaceCell[]): string {
    return places.map((place) => place.name).join(", ");
}

const schema = binder.createNotebook(SimpleSchema, { name: "Schema" });
const person = schema.add(Entity, { name: "Person" });

// @ts-expect-error A `PlaceCell[]` prop rejects schema `Entity` cells.
renderPlaces([person]);
```

### An update with a foreign cell

A transition's `dom` is `PlaceCell[]`, and `update` constrains the new value the
same way, so appending a cell of another object type is rejected.

```ts
import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";

const schema = binder.createNotebook(SimpleSchema, { name: "Schema" });
const entity = schema.add(Entity, { name: "Person" });

// @ts-expect-error A transition's `dom` is `PlaceCell[]`; an `Entity` cell is rejected.
transition.update({ dom: [...transition.dom, entity] });
```

### A theory-less shape cannot create a document

A shape without a `theory` — for example one that names only a subset of cell
types — is rejected by `createNotebook`: it can only describe notebooks, not
originate them.

```ts
const PlacesShape = defineShape({
    objects: { Place: { tag: "Basic", content: "Object" } },
    morphisms: {},
});

// @ts-expect-error A shape without a `theory` cannot originate a document.
binder.createNotebook(PlacesShape, { name: "Nope" });
```
