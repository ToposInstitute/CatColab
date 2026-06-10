A new package for our built-in logics `catcolab-logics`. In the future people
may create their own logics. The logics need to play nice with
`catcolab-document-methods`.

<!-- verifier:prepend-to-following -->

```ts
import { SimpleOlog } from "catcolab-logics";
import { binder, CellKind } from "catcolab-document-methods/future";
```

Notebooks are created through a binder, which ties the notebook API to a
storage backend. The default `binder` uses the plain in-memory backend.

<!-- verifier:prepend-to-following -->

```ts
const notebook = binder.create(SimpleOlog, { name: "An Olog" });
```

We can add rich text cells to our notebook.

<!-- verifier:prepend-to-following -->

```ts
const intro = notebook.richText({ content: "We define a simple olog." });
```

We can create objects and morphisms in the notebook.

<!-- verifier:prepend-to-following -->

```ts
const Type = SimpleOlog.objectTypes.Type;
const Aspect = SimpleOlog.morphismTypes.Aspect;

const source = notebook.object(Type, {
    name: "A",
});

const target = notebook.object(Type, {
    name: "B",
});

const arrow = notebook.morphism(Aspect, {
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

We can iterate through cells: both informal cells and formal judgment cells.
Each cell handle is discriminated by `CellKind`.

```ts
for (const cell of notebook.cells()) {
    switch (cell.kind) {
        case CellKind.RichText:
            console.log("text:", cell.content);
            break;
        case CellKind.Object:
            console.log("object:", cell.name);
            break;
        case CellKind.Morphism:
            console.log("morphism:", cell.name);
            break;
    }
}
```

```
text: We define a simple olog with two objects and one arrow.
object: Source
object: B
morphism: has as
```

## Type safety

Invalid shapes should be type errors:

```ts
// @ts-expect-error Arrays are not valid endpoints in a simple olog.
arrow.update({
    dom: [source],
});

notebook.morphism(Aspect, {
    name: "bad",
    // @ts-expect-error Arrays are not valid endpoints in a simple olog.
    dom: [source, target],
    cod: target,
});
```

Morphism types distinguish their domain from their codomain, so mixing up
endpoints is a type error.

<!-- verifier:reset -->

```ts
import { SimpleSchema } from "catcolab-logics";
import { binder } from "catcolab-document-methods/future";

const schema = binder.create(SimpleSchema, { name: "Example schema" });

const Attr = SimpleSchema.morphismTypes.Attr;
const str = schema.object(SimpleSchema.objectTypes.AttrType, { name: "String" });

schema.morphism(Attr, {
    name: "bad",
    // @ts-expect-error An attribute's domain must be an entity.
    dom: str,
    cod: str,
});
```

But adapt to the underlying logic:

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { PetriNet } from "catcolab-logics";
import { binder } from "catcolab-document-methods/future";

const notebook = binder.create(PetriNet, { name: "Example Petri-net" });

const Place = PetriNet.objectTypes.Place;
const Transition = PetriNet.morphismTypes.Transition;

const a = notebook.object(Place, { name: "A" });

const b = notebook.object(Place, { name: "B" });

const c = notebook.object(Place, { name: "C" });

notebook.morphism(Transition, {
    name: "t1",
    dom: [a, b],
    cod: [c],
});

notebook.morphism(Transition, {
    name: "bad",
    // @ts-expect-error Petri net transitions require arrays of places.
    dom: a,
    cod: [c],
});
```

## Serialization

We can dump a notebook.

<!-- verifier:prepend-to-following -->

```ts
const notebookData = notebook.dump();
```

And load it.

```ts
const notebook2 = binder.load(PetriNet, notebookData);
```

Trying to load a document with the wrong logic will throw an error.

<!-- verifier:throws -->

```ts
import { SimpleOlog } from "catcolab-logics";
binder.load(SimpleOlog, notebookData);
```

```
❌ Cannot load document with theory "petri-net" using a logic with theory "simple-olog".
```

## Filtering by exact types

The simple schema logic has two object types and two morphism types, so we can
filter cells by their exact type, not just their kind.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { SimpleSchema } from "catcolab-logics";
import { binder, byMorphismType, byObjectType } from "catcolab-document-methods/future";

const notebook = binder.create(SimpleSchema, { name: "Example schema" });

const Entity = SimpleSchema.objectTypes.Entity;
const AttrType = SimpleSchema.objectTypes.AttrType;
const Mapping = SimpleSchema.morphismTypes.Mapping;
const Attr = SimpleSchema.morphismTypes.Attr;

const person = notebook.object(Entity, { name: "Person" });
const company = notebook.object(Entity, { name: "Company" });
const str = notebook.object(AttrType, { name: "String" });

notebook.morphism(Mapping, { name: "employer", dom: person, cod: company });
notebook.morphism(Attr, { name: "name", dom: person, cod: str });
```

Filtering on an exact type narrows the handles and excludes cells of every
other type.

```ts
const entities = notebook.cells().filter(byObjectType(Entity));
const attrs = notebook.cells().filter(byMorphismType(Attr));

console.log("entities:", entities.map((cell) => cell.name).join(", "));
console.log("attrs:", attrs.map((cell) => cell.name).join(", "));
```

```
entities: Person, Company
attrs: name
```
