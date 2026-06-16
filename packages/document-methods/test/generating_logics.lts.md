# Generating logics

A logic can be defined from a compact specification. The generator produces the
typed cell constructors and the `ModelLogic` value used by notebooks.

<!-- verifier:prepend-to-following -->

```ts
import { defineModelLogic, binder, byType } from "catcolab-documents";
import { ThSchema } from "catlog-wasm";

const SimpleSchema = defineModelLogic({
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    objects: {
        Entity: "Entity",
        AttrType: "AttrType",
    },
    morphisms: {
        Mapping: { dom: "Entity", cod: "Entity" },
        Attr: { dom: "Entity", cod: "AttrType" },
        Operation: { dom: "AttrType", cod: "AttrType" },
    },
});

const { Entity, AttrType, Mapping, Attr, Operation } = SimpleSchema.cellTypes;
```

<!-- verifier:prepend-to-following -->

```ts
const notebook = binder.createNotebook(SimpleSchema, { name: "Company schema" });

const person = notebook.add(Entity, { name: "Person" });
const company = notebook.add(Entity, { name: "Company" });
const str = notebook.add(AttrType, { name: "String" });
const upper = notebook.add(AttrType, { name: "UpperString" });

notebook.add(Mapping, { name: "employer", dom: person, cod: company });
notebook.add(Attr, { name: "name", dom: person, cod: str });
notebook.add(Operation, { name: "uppercase", dom: str, cod: upper });
```

<!-- verifier:prepend-to-following -->

```ts
const entities = notebook.cells().filter(byType(Entity));
const operations = notebook.cells().filter(byType(Operation));

console.log("entities:", entities.map((cell) => cell.name).join(", "));
console.log("operations:", operations.map((cell) => cell.name).join(", "));
```

```txt
entities: Person, Company
operations: uppercase
```

Endpoint types are inferred from the compact definition.

<!-- verifier:prepend-to-following -->

```ts
// @ts-expect-error A mapping's codomain must be an entity.
notebook.add(Mapping, {
    name: "bad",
    dom: person,
    cod: str,
});
```

<!-- verifier:prepend-to-following -->

```ts
// @ts-expect-error An attribute's domain must be an entity.
notebook.add(Attr, {
    name: "bad",
    dom: str,
    cod: str,
});
```

Array endpoints are written with a single-element tuple in the logic definition.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { defineModelLogic, binder } from "catcolab-documents";
import { ThSymMonoidalCategory } from "catlog-wasm";

const PetriNet = defineModelLogic({
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    objects: {
        Place: "Object",
    },
    morphisms: {
        Transition: { dom: ["Place"], cod: ["Place"] },
    },
});

const { Place, Transition } = PetriNet.cellTypes;
```

<!-- verifier:prepend-to-following -->

```ts
const notebook = binder.createNotebook(PetriNet, { name: "Petri net" });
const a = notebook.add(Place, { name: "A" });
const b = notebook.add(Place, { name: "B" });

notebook.add(Transition, {
    name: "fires",
    dom: [a],
    cod: [b],
});
```

<!-- verifier:prepend-to-following -->

```ts
// @ts-expect-error Petri-net transition endpoints are arrays.
notebook.add(Transition, {
    name: "bad",
    dom: a,
    cod: [b],
});
```
