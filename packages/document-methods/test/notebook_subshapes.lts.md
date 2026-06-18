# Interactive components over sub-shapes

A shape declares the object and morphism types a notebook is built from. A
component can be written against a _sub-shape_ — a shape that names only the
cell types the component touches — and stay fully interactive: it reads cells
with `byObjectType`/`byMorphismType`, edits them with `update`, and adds new
ones with `add`. Because a notebook over a richer shape is assignable to one
over a sub-shape, the component accepts a notebook of the full theory.

<!-- verifier:prepend-to-following -->

```ts
import { binder, byObjectType, defineShape, type Notebook } from "catcolab-documents";
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
```

A sub-shape names just the cell types the component needs — here, places. It has
no `theory`, so it is a contract for _consuming_ notebooks, not for creating
them: a sub-shape cannot be passed to `createNotebook`.

<!-- verifier:prepend-to-following -->

```ts
const PlacesShape = defineShape({
    objects: { Place: { tag: "Basic", content: "Object" } },
    morphisms: {},
});
```

`renamePlaces` is written against `Notebook<typeof PlacesShape>`. It filters the
notebook's places, renames each, and adds one — every step type-checked against
the sub-shape.

<!-- verifier:prepend-to-following -->

```ts
function renamePlaces(notebook: Notebook<typeof PlacesShape>): string[] {
    for (const place of notebook.cells().filter(byObjectType(PlacesShape.objects.Place))) {
        place.update({ name: place.name.toUpperCase() });
    }
    notebook.add(PlacesShape.objects.Place, { name: "new" });
    return notebook
        .cells()
        .filter(byObjectType(PlacesShape.objects.Place))
        .map((place) => place.name);
}
```

A full Petri-net notebook — whose shape has both `Place` and `Transition` — is
accepted wherever a `Notebook<typeof PlacesShape>` is expected.

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

### A sub-shape cannot create a document

`PlacesShape` has no `theory`, so it is rejected by `createNotebook`: it can only
consume notebooks created from a full shape.

```ts
// @ts-expect-error A sub-shape without a `theory` cannot originate a document.
binder.createNotebook(PlacesShape, { name: "Nope" });
```
