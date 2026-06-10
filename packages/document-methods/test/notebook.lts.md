A new package for our built-in logics `catcolab-logics`. In the future people
may create their own logics. The logics need to play nice with
`catcolab-document-methods`.

<!-- verifier:prepend-to-following -->

```ts
import { SimpleOlog } from "catcolab-logics";
import { binder } from "catcolab-document-methods/future";
```

Notebooks are created through a binder, which ties the notebook API to a
storage backend. The default `binder` uses the plain in-memory backend.

<!-- verifier:prepend-to-following -->

```ts
const notebook = binder.createNotebook(SimpleOlog, { name: "An Olog" });
```

We can add rich text cells to our notebook.

<!-- verifier:prepend-to-following -->

```ts
const intro = notebook.richText({ content: "We define a simple olog." });
```

We can create objects and morphisms in the notebook.

<!-- verifier:prepend-to-following -->

```ts
const Type = SimpleOlog.objects.Type;
const Aspect = SimpleOlog.morphisms.Aspect;

const source = notebook.addObject(Type, {
    name: "A",
});

const target = notebook.addObject(Type, {
    name: "B",
});

const arrow = notebook.addMorphism(Aspect, {
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
import { CellKind } from "catcolab-document-methods/future";

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
import { SimpleSchema } from "catcolab-logics";
import { binder } from "catcolab-document-methods/future";

const notebook = binder.createNotebook(SimpleSchema, { name: "Example schema" });

const Entity = SimpleSchema.objects.Entity;
const AttrType = SimpleSchema.objects.AttrType;
const Mapping = SimpleSchema.morphisms.Mapping;
const Attr = SimpleSchema.morphisms.Attr;

const person = notebook.addObject(Entity, { name: "Person" });
const company = notebook.addObject(Entity, { name: "Company" });
const str = notebook.addObject(AttrType, { name: "String" });

notebook.addMorphism(Mapping, { name: "employer", dom: person, cod: company });
notebook.addMorphism(Attr, { name: "name", dom: person, cod: str });
```

Filtering on an exact type narrows the handles and excludes cells of every
other type.

```ts
import { byMorphismType, byObjectType } from "catcolab-document-methods/future";

const entities = notebook.cells().filter(byObjectType(Entity));
const attrs = notebook.cells().filter(byMorphismType(Attr));

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
import { SimpleOlog } from "catcolab-logics";
import { binder } from "catcolab-document-methods/future";

const notebook = binder.createNotebook(SimpleOlog, { name: "An Olog" });

const Type = SimpleOlog.objects.Type;
const Aspect = SimpleOlog.morphisms.Aspect;

const source = notebook.addObject(Type, { name: "A" });
const target = notebook.addObject(Type, { name: "B" });
const arrow = notebook.addMorphism(Aspect, { name: "has", dom: source, cod: target });
```

Invalid shapes should be type errors:

```ts
// @ts-expect-error Arrays are not valid endpoints in a simple olog.
arrow.update({
    dom: [source],
});

notebook.addMorphism(Aspect, {
    name: "bad",
    // @ts-expect-error Arrays are not valid endpoints in a simple olog.
    dom: [source, target],
    cod: target,
});
```

<!-- verifier:reset -->

```ts
import { SimpleSchema } from "catcolab-logics";
import { binder } from "catcolab-document-methods/future";

const schema = binder.createNotebook(SimpleSchema, { name: "Example schema" });

const Attr = SimpleSchema.morphisms.Attr;
const str = schema.addObject(SimpleSchema.objects.AttrType, { name: "String" });

schema.addMorphism(Attr, {
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

const notebook = binder.createNotebook(PetriNet, { name: "Example Petri-net" });

const Place = PetriNet.objects.Place;
const Transition = PetriNet.morphisms.Transition;

const a = notebook.addObject(Place, { name: "A" });

const b = notebook.addObject(Place, { name: "B" });

const c = notebook.addObject(Place, { name: "C" });

notebook.addMorphism(Transition, {
    name: "t1",
    dom: [a, b],
    cod: [c],
});

notebook.addMorphism(Transition, {
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
const notebook2 = binder.loadNotebook(PetriNet, notebookData);
```

Trying to load a document with the wrong logic will throw an error.

<!-- verifier:throws -->

```ts
import { SimpleOlog } from "catcolab-logics";
binder.loadNotebook(SimpleOlog, notebookData);
```

```
❌ Cannot load document with theory "petri-net" using a logic with theory "simple-olog".
```
