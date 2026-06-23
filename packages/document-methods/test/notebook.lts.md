Two new package for our built-in logics `catcolab-logics` and
`catcolab-documents`. In the future people may create their own logics instead of
using `catcolab-logics`. The logics need to play nice with `catcolab-documents`.

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder, RichText } from "catcolab-documents";
```

Notebooks are created through a binder, which ties the notebook API to a
document store. The default `binder` uses the plain in-memory store.

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
import { CellKind } from "catcolab-documents";

for (const cell of notebook.cells()) {
    switch (cell.kind) {
        case CellKind.RichText:
            console.log("text:", cell.content);
            break;
        case CellKind.Object:
            console.log("object:", cell.name, "type:", cell.type.obType.content);
            break;
        case CellKind.Morphism:
            console.log("morphism:", cell.name, "type tag:", cell.type.morType.tag);
            break;
    }
}
```

```
text: We define a simple olog with two objects and one arrow.
object: Source type: Object
object: B type: Object
morphism: has as type tag: Hom
```

We can filter cells by their type, not just their kind and we provide some utilities to do so.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { binder } from "catcolab-documents";

const notebook = binder.createNotebook(SimpleSchema, { name: "Example schema" });

const person = notebook.add(Entity, { name: "Person" });
const company = notebook.add(Entity, { name: "Company" });
const str = notebook.add(AttrType, { name: "String" });

notebook.add(Mapping, { name: "employer", dom: person, cod: company });
notebook.add(Attr, { name: "name", dom: person, cod: str });

const entities = notebook.cellsOf(Entity);
const attrs = notebook.cellsOf(Attr);

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
import { binder } from "catcolab-documents";

const notebook = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const source = notebook.add(Type, { name: "A" });
const target = notebook.add(Type, { name: "B" });
const arrow = notebook.add(Aspect, { name: "has", dom: source, cod: target });
```

Invalid shapes should be type errors:

```ts
// @ts-expect-error Arrays are not valid endpoints in a simple olog.
arrow.update({ dom: [source] });

// @ts-expect-error Arrays are not valid endpoints in a simple olog.
notebook.add(Aspect, { name: "bad", dom: [source, target], cod: target });
```

<!-- verifier:reset -->

```ts
import { AttrType, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { binder } from "catcolab-documents";

const schema = binder.createNotebook(SimpleSchema, { name: "Example schema" });

const str = schema.add(AttrType, { name: "String" });

// @ts-expect-error A mapping's endpoints must be entities, not attribute types.
schema.add(Mapping, {
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
import { binder } from "catcolab-documents";

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
import { binder, RichText } from "catcolab-documents";

const notebook = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const a = notebook.add(Type, { name: "A" });
const b = notebook.add(Type, { name: "B" });
const c = notebook.add(Type, { name: "C" });

function names() {
    return notebook
        .cellsOf(Type)
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

After deletion, reading fields off the stale handle returns `undefined`.

```ts
b.delete();
console.log(b.name);
```

```
undefined
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

## Validation

A notebook is a document: a loosely structured collection of cells. To use it
as a formal model we elaborate it into a core model and validate it. The
`validate` method walks the formal cells, builds the core model, and runs the
logic's validation in one step. It returns a tagged result so that ill-formed
and invalid notebooks can be handled without throwing.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { binder } from "catcolab-documents";

const notebook = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const source = notebook.add(Type, { name: "A" });
const target = notebook.add(Type, { name: "B" });
notebook.add(Aspect, { name: "has", dom: source, cod: target });
```

A well-formed notebook validates to a `Valid` model.

```ts
const result = notebook.validate();
console.log("tag:", result.tag);
```

```
tag: Valid
```

The validated model is available on the result and can be queried.

```ts
const result = notebook.validate();
if (result.tag === "Valid") {
    console.log("objects:", result.model.obGenerators().length);
    console.log("morphisms:", result.model.morGenerators().length);
}
```

```
objects: 2
morphisms: 1
```

```ts
import type { ModelValidationResult } from "catcolab-documents";

function describe(result: ModelValidationResult): string {
    switch (result.tag) {
        case "Valid":
            return `valid model with ${result.model.obGenerators().length} objects`;
        case "Invalid":
            return `invalid model with ${result.errors.length} errors`;
        case "Illformed":
            return `ill-formed: ${result.error}`;
    }
}

console.log(describe(notebook.validate()));
```

```
valid model with 2 objects
```

## Serialization

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { PetriNet } from "catcolab-logics/petri-net";
import { binder } from "catcolab-documents";

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

Trying to load a document with the wrong shape will throw an error.

<!-- verifier:throws -->

```ts
import { SimpleOlog } from "catcolab-logics/simple-olog";
binder.loadNotebook(SimpleOlog, notebookData);
```

```
❌ Cannot load document with theory "petri-net" using a shape with theory "simple-olog".
```

## Migrating between logics

A notebook is bound to a single logic, but its document can be migrated to
another logic. Migration mirrors the core: it transports the elaborated model
along a theory morphism and re-types each cell, preserving cell ids, names, and
morphism endpoints. Only the cell types change.

`migrate` **mutates the notebook in place**: it rewrites the underlying
document to the target theory rather than producing a copy. It returns a new
notebook handle bound to the target logic over that same document. The original
handle is now stale — its implicit types no longer matches the document it points at — so
continue through the returned handle.

Migrating in place means the store handle is preserved: the document keeps its
identity across the migration. With the Automerge store, for example, the
migrated notebook shares the same `DocHandle` and Automerge URL as before, so
references held elsewhere (links, open editors, sync peers) still resolve.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { binder } from "catcolab-documents";

const olog = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const a = olog.add(Type, { name: "A" });
const b = olog.add(Type, { name: "B" });
olog.add(Aspect, { name: "has", dom: a, cod: b });
```

Migrating an olog to a schema turns each `Type` into an `Entity` and each
`Aspect` into a `Mapping`. Names and endpoints are carried over unchanged.
Because `migrate` mutates in place, the olog notebook's own document is now a
schema; `migrate` hands back a schema-typed handle over it.

```ts
const schema = olog.migrate(SimpleSchema);

// The original document was rewritten in place, not copied.
console.log("same document:", schema.document === olog.document);
console.log("theory:", schema.document.theory);
console.log(
    "entities:",
    schema
        .cellsOf(Entity)
        .map((cell) => cell.name)
        .join(", "),
);
console.log(
    "mappings:",
    schema
        .cellsOf(Mapping)
        .map((cell) => cell.name)
        .join(", "),
);
console.log("tag:", schema.validate().tag);
```

```
same document: true
theory: simple-schema
entities: A, B
mappings: has
tag: Valid
```

### When migration goes wrong

Not every pair of logics is connected by a migration. Migrating to a logic
with no defined path throws.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { PetriNet } from "catcolab-logics/petri-net";
import { binder } from "catcolab-documents";

const olog = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const a = olog.add(Type, { name: "A" });
const b = olog.add(Type, { name: "B" });
olog.add(Aspect, { name: "has", dom: a, cod: b });
```

<!-- verifier:throws -->

```ts
olog.migrate(PetriNet);
```

```
❌ No migration defined from "simple-olog" to "petri-net".
```
