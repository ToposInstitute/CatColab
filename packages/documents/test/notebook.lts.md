Two new package for our built-in logics `catcolab-logics` and
`catcolab-documents`. In the future people may create their own logics instead of
using `catcolab-logics`. The logics need to play nice with `catcolab-documents`.

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, RichText } from "catcolab-documents";
const binder = createBinder();
```

Notebooks are created through a binder, which ties the notebook API to a
document store. `createBinder()` returns a binder over the plain
in-memory store.

<!-- verifier:prepend-to-following -->

```ts
const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });
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
    label: "A",
});

const target = notebook.add(Type, {
    label: "B",
});

const arrow = notebook.add(Aspect, {
    label: "has",
    from: source,
    to: target,
});
```

We can update any item.

<!-- verifier:prepend-to-following -->

```ts
notebook.update({ title: "A simple Olog example" });

intro.update({
    content: "We define a simple olog with two objects and one arrow.",
});

source.update({
    label: "Source",
});

arrow.update({
    label: "has as",
    from: source,
    to: target,
});
```

We can also do partial updates.

```ts
arrow.update({
    label: "has as example",
});
```

We can duplicate formal cells. Copies keep the same logical shape but receive
fresh identities, and their handles can be updated independently.

```ts
const sourceCopy = source.duplicate();
sourceCopy.update({
    label: "Source copy",
});

console.log("source:", source.label);
console.log("source copy:", sourceCopy.label);
```

```
source: Source
source copy: Source copy
```

## Instantiation

```ts
import { Instantiation } from "catcolab-documents";

const anotherOlog = await binder.createNotebook(SimpleOlog, { title: "Another Olog" });
const thing = anotherOlog.add(Type, { label: "Thing" });

const instantiation = notebook.add(Instantiation, {
    label: "ImportedOlog",
    model: anotherOlog,
    // maps ImportedOlog.Thing <- B
    specializations: [{ object: thing, as: target }],
});

console.log("instantiation:", instantiation.label);
```

```
instantiation: ImportedOlog
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
            console.log("object:", cell.label, "type:", cell.type.obType.content);
            break;
        case CellKind.Morphism:
            console.log("morphism:", cell.label, "type tag:", cell.type.morType.tag);
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

`formalCells` yields only the formal judgment cells, excluding rich text.

```ts
console.log("all:", notebook.cells().length);
console.log("formal:", notebook.formalCells().length);
for (const cell of notebook.formalCells()) {
    console.log("formal kind:", cell.kind.toString());
}
```

```
all: 4
formal: 3
formal kind: Symbol(object)
formal kind: Symbol(object)
formal kind: Symbol(morphism)
```

We can filter cells by their type, not just their kind and we provide some utilities to do so.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

const person = notebook.add(Entity, { label: "Person" });
const company = notebook.add(Entity, { label: "Company" });

const mapping = notebook.add(Mapping, { label: "employer", from: person, to: company });
```

```ts
const entities = notebook.cellsOf(Entity);
const mappings = notebook.cellsOf(Mapping);

console.log("entities:", entities.map((cell) => cell.label).join(", "));
console.log("mappings:", mappings.map((cell) => cell.label).join(", "));
```

```
entities: Person, Company
mappings: employer
```

`cells` and `cellsOf` do not recurse into instantiations.

<!-- verifier:prepend-to-following -->

```ts
import { Instantiation } from "catcolab-documents";

const anotherSchema = await binder.createNotebook(SimpleSchema, { title: "Another schema" });
const enterprise = anotherSchema.add(Entity, { label: "Enterprise" });
const building = anotherSchema.add(Entity, { label: "Building" });
const owner = anotherSchema.add(Mapping, { label: "owner", from: enterprise, to: building });

const instantiation = notebook.add(Instantiation, {
    label: "ImportedSchema",
    model: anotherSchema,
    specializations: [{ object: enterprise, as: company }],
});
```

```ts
const instantiations = notebook.cellsOf(Instantiation);
const entities = notebook.cellsOf(Entity);
const mappings = notebook.cellsOf(Mapping);

console.log("instantiations:", instantiations.map((cell) => cell.label).join(", "));
console.log("entities:", entities.map((cell) => cell.label).join(", "));
console.log("mappings:", mappings.map((cell) => cell.label).join(", "));
```

```
instantiations: ImportedSchema
entities: Person, Company
mappings: employer
```

## Getting a cell by id

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

const person = notebook.add(Entity, { label: "Person" });
const company = notebook.add(Entity, { label: "Company" });

const mapping = notebook.add(Mapping, { label: "employer", from: person, to: company });
```

`get` returns a `Result`: an `Ok` carrying the cell as `content`, or an `Err`
carrying an array of issues.

```ts
const found = notebook.get(Entity, person.id);
console.log("tag:", found.tag);
if (found.tag === "Ok") {
    console.log("found:", found.content.label);
}
```

```
tag: Ok
found: Person
```

A missing id, or an id whose cell has a different type, yields an `Err` result
whose issues describe the problem.

```ts
const missing = notebook.get(Entity, "00000000-0000-0000-0000-000000000000");
if (missing.tag === "Err") {
    console.log("missing:", missing.content.map((issue) => issue.message).join("; "));
}

// `employer` is a mapping, not an entity.
const wrongType = notebook.get(Entity, mapping.id);
if (wrongType.tag === "Err") {
    console.log(
        "wrong type:",
        wrongType.content
            .map((issue) => issue.message.replace(mapping.id, "<our-random-uuid>"))
            .join("; "),
    );
}
```

```
missing: No cell with id "00000000-0000-0000-0000-000000000000".
wrong type: Cell "<our-random-uuid>" is not of the expected type.
```

## Type safety

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

const source = notebook.add(Type, { label: "A" });
const target = notebook.add(Type, { label: "B" });
const arrow = notebook.add(Aspect, { label: "has", from: source, to: target });
```

Invalid shapes should be type errors:

```ts
// @ts-expect-error Arrays are not valid endpoints in a simple olog.
arrow.update({ from: [source] });

// @ts-expect-error Arrays are not valid endpoints in a simple olog.
notebook.add(Aspect, { label: "bad", from: [source, target], to: target });
```

<!-- verifier:reset -->

```ts
import { AttrType, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

const str = schema.add(AttrType, { label: "String" });

// @ts-expect-error A mapping's endpoints must be entities, not attribute types.
schema.add(Mapping, {
    label: "bad",
    from: str,
    to: str,
});
```

But adapt to the underlying logic:

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const notebook = await binder.createNotebook(PetriNet, { title: "Example Petri-net" });

const a = notebook.add(Place, { label: "A" });

const b = notebook.add(Place, { label: "B" });

const c = notebook.add(Place, { label: "C" });

notebook.add(Transition, {
    label: "t1",
    from: [a, b],
    to: [c],
});

// @ts-expect-error Petri net transitions require arrays of places.
notebook.add(Transition, {
    label: "bad",
    from: a,
    to: [c],
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
import { createBinder, RichText } from "catcolab-documents";
const binder = createBinder();

const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

const a = notebook.add(Type, { label: "A" });
const b = notebook.add(Type, { label: "B" });
const c = notebook.add(Type, { label: "C" });

function names() {
    return notebook
        .cellsOf(Type)
        .map((cell) => cell.label)
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
console.log(b.label);
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
logic's validation in one step. It returns a `Result`: an `Ok` carrying the
elaborated model as `content`, or an `Err` carrying an array of issues, so
ill-formed and invalid notebooks can be handled without throwing.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

const source = notebook.add(Type, { label: "A" });
const target = notebook.add(Type, { label: "B" });
notebook.add(Aspect, { label: "has", from: source, to: target });
```

A well-formed notebook validates to an `Ok` carrying the model as `content`.

```ts
const result = await notebook.validate();
console.log("valid:", result.tag === "Ok");
```

```
valid: true
```

The validated model is available on the result and can be queried.

```ts
const result = await notebook.validate();
if (result.tag === "Ok") {
    console.log("objects:", result.content.obGenerators().length);
    console.log("morphisms:", result.content.morGenerators().length);
}
```

```
objects: 2
morphisms: 1
```

```ts
import type { ModelValidationResult } from "catcolab-documents";

function describe(result: ModelValidationResult): string {
    if (result.tag === "Ok") {
        return `valid model with ${result.content.obGenerators().length} objects`;
    }
    return `invalid model: ${result.content.map((issue) => issue.message).join("; ")}`;
}

console.log(describe(await notebook.validate()));
```

```
valid model with 2 objects
```

An ill-formed notebook validates to an `Err` carrying issues.

<!-- verifier:reset -->

```ts
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createBinder, Instantiation } from "catcolab-documents";
const binder = createBinder();

const first = await binder.createNotebook(SimpleOlog, { title: "First" });
const second = await binder.createNotebook(SimpleOlog, { title: "Second" });

first.add(Type, { label: "A" });
second.add(Type, { label: "B" });

// A cycle: `first` instantiates `second`, which instantiates `first`.
first.add(Instantiation, { label: "ImportedSecond", model: second });
second.add(Instantiation, { label: "ImportedFirst", model: first });

const result = await first.validate();
console.log("valid:", result.tag === "Ok");
if (result.tag === "Err") {
    console.log("issues:", result.content.map((issue) => issue.message).join("; "));
}
```

```
valid: false
issues: Instantiation cycle detected: "First" → "Second" → "First". A notebook cannot instantiate itself, directly or indirectly. To fix, remove one of the instantiations in this chain.
```

## Serialization

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { PetriNet } from "catcolab-logics/petri-net";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const notebook = await binder.createNotebook(PetriNet, { title: "Example Petri-net" });
```

We can dump a notebook.

<!-- verifier:prepend-to-following -->

```ts
const petriNetData = notebook.dump();
```

And load it. `loadNotebook` returns a `Result`: an `Ok` carrying the notebook
as `content`, or an `Err` carrying an array of issues.

```ts
const loaded = await binder.loadNotebook(PetriNet, petriNetData);
console.log("tag:", loaded.tag);
if (loaded.tag === "Ok") {
    console.log("loaded:", loaded.content.title);
}
```

```
tag: Ok
loaded: Example Petri-net
```

Trying to load a document with the wrong shape yields an `Err` result whose
issues describe the mismatch.

```ts
import { SimpleOlog } from "catcolab-logics/simple-olog";

const wrong = await binder.loadNotebook(SimpleOlog, petriNetData);
if (wrong.tag === "Err") {
    console.log("issues:", wrong.content.map((issue) => issue.message).join("; "));
}
```

```
issues: Cannot load document with theory "petri-net" using a shape with theory "simple-olog".
```

## Migrating between logics

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const olog = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

const a = olog.add(Type, { label: "A" });
const b = olog.add(Type, { label: "B" });
olog.add(Aspect, { label: "has", from: a, to: b });
```

`migrateTo` returns a `Result`: an `Ok` carrying the migrated notebook as
`content`, or an `Err` carrying an array of issues.

```ts
const migration = await olog.migrateTo(SimpleSchema);
console.log("tag:", migration.tag);
if (migration.tag === "Ok") {
    const schema = migration.content;

    // The original document was rewritten in place, not copied.
    console.log("same document:", schema.document === olog.document);
    console.log("theory:", schema.document.theory);
    console.log(
        "entities:",
        schema
            .cellsOf(Entity)
            .map((cell) => cell.label)
            .join(", "),
    );
    console.log(
        "mappings:",
        schema
            .cellsOf(Mapping)
            .map((cell) => cell.label)
            .join(", "),
    );
    console.log("valid:", (await schema.validate()).tag === "Ok");
}
```

```
tag: Ok
same document: true
theory: simple-schema
entities: A, B
mappings: has
valid: true
```

### When migration goes wrong

Not every pair of logics is connected by a migration. Migrating to a logic
with no defined path yields an `Err` result whose issues describe the
problem, instead of throwing.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { PetriNet } from "catcolab-logics/petri-net";
import { createBinder } from "catcolab-documents";
const binder = createBinder();

const olog = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

const a = olog.add(Type, { label: "A" });
const b = olog.add(Type, { label: "B" });
olog.add(Aspect, { label: "has", from: a, to: b });
```

```ts
const result = await olog.migrateTo(PetriNet);
if (result.tag === "Err") {
    console.log("issues:", result.content.map((issue) => issue.message).join("; "));
}
```

```
issues: No migration defined from "simple-olog" to "petri-net".
```
