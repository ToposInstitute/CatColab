Two new package for our built-in logics `catcolab-logics` and
`catcolab-binder`. In the future people may create their own logics instead of
using `catcolab-logics`. The logics need to play nice with `catcolab-binder`.

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder, RichText } from "catcolab-binder";
```

Notebooks are created through a binder, which ties the notebook API to a
storage backend. The default `binder` uses the plain in-memory backend.

<!-- verifier:prepend-to-following -->

```ts
const notebook = binder.createNotebook(SimpleOlog, { name: "An Olog" });
```

All cells are added with a single `add` method. The first argument selects
the kind of cell: `RichText` for prose, or an object/morphism type from the
logic for formal cells.

<!-- verifier:prepend-to-following -->

```ts
const intro = notebook.add(RichText, { content: "We define a simple olog." });
```

We can create objects and morphisms in the notebook.

<!-- verifier:prepend-to-following -->

```ts
const source = notebook.add(Type, {
    name: "A",
});

const target = notebook.add(Type, {
    name: "B",
});

const arrow = notebook.add(Aspect, {
    name: "has",
    dom: source,
    cod: target,
});
```

We can update any item.

<!-- verifier:prepend-to-following -->

```ts
notebook.update({ name: "A simple Olog example" });

intro.update({
    content: "We define a simple olog with two objects and one arrow.",
});

source.update({
    name: "Source",
});

arrow.update({
    name: "has as",
    dom: source,
    cod: target,
});
```

We can also do partial updates.

```ts
arrow.update({
    name: "has as example",
});
```

We can duplicate formal cells. Copies keep the same logical shape but receive
fresh identities, and their handles can be updated independently.

```ts
const sourceCopy = source.duplicate();
sourceCopy.update({
    name: "Source copy",
});

console.log("source:", source.name);
console.log("source copy:", sourceCopy.name);
```

```
source: Source
source copy: Source copy
```

## Iterating through cells

We can iterate through cells: both informal cells and formal judgment cells.
Each cell handle is discriminated by `CellKind`.

```ts
import { CellKind } from "catcolab-binder";

for (const cell of notebook.cells()) {
    switch (cell.kind) {
        case CellKind.RichText:
            console.log("text:", cell.content);
            break;
        case CellKind.Object:
            console.log("object:", cell.name, "is a Type:", cell.type === Type);
            break;
        case CellKind.Morphism:
            console.log("morphism:", cell.name, "is an Aspect:", cell.type === Aspect);
            break;
    }
}
```

```
text: We define a simple olog with two objects and one arrow.
object: Source is a Type: true
object: B is a Type: true
morphism: has as is an Aspect: true
```

We can filter cells by their type, not just their kind and we provide some utilities to do so.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { binder, byType } from "catcolab-binder";

const notebook = binder.createNotebook(SimpleSchema, { name: "Example schema" });

const person = notebook.add(Entity, { name: "Person" });
const company = notebook.add(Entity, { name: "Company" });
const str = notebook.add(AttrType, { name: "String" });

notebook.add(Mapping, { name: "employer", dom: person, cod: company });
notebook.add(Attr, { name: "name", dom: person, cod: str });

const entities = notebook.cells().filter(byType(Entity));
const attrs = notebook.cells().filter(byType(Attr));

console.log("entities:", entities.map((cell) => cell.name).join(", "));
console.log("attrs:", attrs.map((cell) => cell.name).join(", "));
```

```
entities: Person, Company
attrs: name
```

## Type safety

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder } from "catcolab-binder";

const notebook = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const source = notebook.add(Type, { name: "A" });
const target = notebook.add(Type, { name: "B" });
const arrow = notebook.add(Aspect, { name: "has", dom: source, cod: target });
```

Invalid shapes should be type errors:

```ts
// @ts-expect-error Arrays are not valid endpoints in a simple olog.
arrow.update({
    dom: [source],
});

// @ts-expect-error Arrays are not valid endpoints in a simple olog.
notebook.add(Aspect, {
    name: "bad",
    dom: [source, target],
    cod: target,
});
```

<!-- verifier:reset -->

```ts
import { Attr, AttrType, SimpleSchema } from "catcolab-logics/simple-schema";
import { binder } from "catcolab-binder";

const schema = binder.createNotebook(SimpleSchema, { name: "Example schema" });

const str = schema.add(AttrType, { name: "String" });

// @ts-expect-error An attribute's domain must be an entity.
schema.add(Attr, {
    name: "bad",
    dom: str,
    cod: str,
});
```

But adapt to the underlying logic:

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { binder } from "catcolab-binder";

const notebook = binder.createNotebook(PetriNet, { name: "Example Petri-net" });

const a = notebook.add(Place, { name: "A" });

const b = notebook.add(Place, { name: "B" });

const c = notebook.add(Place, { name: "C" });

notebook.add(Transition, {
    name: "t1",
    dom: [a, b],
    cod: [c],
});

// @ts-expect-error Petri net transitions require arrays of places.
notebook.add(Transition, {
    name: "bad",
    dom: a,
    cod: [c],
});
```

## Re-ordering cells

Every cell handle can move itself within the notebook. Moves locate the cell
by its id at the moment the change applies, so they remain valid even if the
notebook was edited after the handle was obtained.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder, byType, RichText } from "catcolab-binder";

const notebook = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const a = notebook.add(Type, { name: "A" });
const b = notebook.add(Type, { name: "B" });
const c = notebook.add(Type, { name: "C" });

function names() {
    return notebook
        .cells()
        .filter(byType(Type))
        .map((cell) => cell.name)
        .join(", ");
}
```

`moveUp` and `moveDown` shift a cell one position; `moveTo` moves it to an
index, interpreted after the cell is removed from its current position.

```ts
c.moveUp();
console.log(names());

a.moveDown();
console.log(names());

b.moveTo(0);
console.log(names());
```

```
A, C, B
C, A, B
B, C, A
```

Impossible moves are silent no-ops and out-of-range targets clamp to the ends
of the notebook.

```ts
a.moveUp();
c.moveDown();
console.log(names());

b.moveTo(99);
console.log(names());
```

```
A, B, C
A, C, B
```

## Deleting cells

Every cell handle can remove itself from the notebook with `delete`. Like the
reorder methods, delete locates the cell by its id when the change applies, so
it stays valid even if the notebook was edited after the handle was obtained.

Deleting a cell removes it from the notebook's order and contents.

```ts
console.log(names());
b.delete();
console.log(names());
```

```
A, B, C
A, C
```

Rich-text cells can be deleted in the same way.

```ts
const note = notebook.add(RichText, { content: "A note." });
console.log(notebook.cells().length);
note.delete();
console.log(notebook.cells().length);
```

```
4
3
```

After deletion, reading fields off the stale handle throws.

<!-- verifier:throws -->

```ts
b.delete();
console.log(b.name);
```

```
❌ not found (it may have been deleted).
```

Deleting an already-deleted cell is a silent no-op.

```ts
b.delete();
b.delete();
console.log(names());
```

```
A, C
```

## Serialization

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { PetriNet } from "catcolab-logics/petri-net";
import { binder } from "catcolab-binder";

const notebook = binder.createNotebook(PetriNet, { name: "Example Petri-net" });
```

We can dump a notebook.

<!-- verifier:prepend-to-following -->

```ts
const notebookData = notebook.dump();
```

And load it.

```ts
const notebook2 = binder.loadNotebook(PetriNet, notebookData);
```

Trying to load a document with the wrong logic will throw an error.

<!-- verifier:throws -->

```ts
import { SimpleOlog } from "catcolab-logics/simple-olog";
binder.loadNotebook(SimpleOlog, notebookData);
```

```
❌ Cannot load document with theory "petri-net" using a logic with theory "simple-olog".
```
