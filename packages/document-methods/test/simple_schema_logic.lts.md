# Defining a schema shape

A shape declares a notebook's object and morphism types as plain `ObType`/
`MorType` literals. A morphism's endpoint object type and arity are read from
its `MorType` structure, so no separate endpoint declaration is needed.

<!-- verifier:prepend-to-following -->

```ts
import { defineShape } from "catcolab-documents";
import { ThSchema } from "catlog-wasm";

const SimpleSchema = defineShape({
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    objects: {
        Entity: { tag: "Basic", content: "Entity" },
        AttrType: { tag: "Basic", content: "AttrType" },
    },
    morphisms: {
        // `Hom(Entity)`: a mapping between entities; endpoints are `Entity` cells.
        Mapping: { tag: "Hom", content: { tag: "Basic", content: "Entity" } },
        // A `Basic` morphism does not record its endpoints, so they stay untyped.
        Attr: { tag: "Basic", content: "Attr" },
        // `Hom(AttrType)`: an operation between attribute types.
        Operation: { tag: "Hom", content: { tag: "Basic", content: "AttrType" } },
    },
});

const { Entity, AttrType } = SimpleSchema.objects;
const { Mapping, Attr, Operation } = SimpleSchema.morphisms;
```

<!-- verifier:prepend-to-following -->

```ts
import { binder, byMorphismType, byObjectType } from "catcolab-documents";

const notebook = binder.createNotebook(SimpleSchema, { name: "Company schema" });
```

<!-- verifier:prepend-to-following -->

```ts
const person = notebook.add(Entity, { name: "Person" });
const company = notebook.add(Entity, { name: "Company" });
const str = notebook.add(AttrType, { name: "String" });
const upper = notebook.add(AttrType, { name: "UpperString" });

notebook.add(Mapping, { name: "employer", dom: person, cod: company });
notebook.add(Attr, { name: "name", dom: person, cod: str });
notebook.add(Operation, { name: "uppercase", dom: str, cod: upper });
```

```ts
const entities = notebook.cells().filter(byObjectType(Entity));
const mappings = notebook.cells().filter(byMorphismType(Mapping));
const attrs = notebook.cells().filter(byMorphismType(Attr));
const operations = notebook.cells().filter(byMorphismType(Operation));

console.log("entities:", entities.map((cell) => cell.name).join(", "));
console.log("mappings:", mappings.map((cell) => cell.name).join(", "));
console.log("attrs:", attrs.map((cell) => cell.name).join(", "));
console.log("operations:", operations.map((cell) => cell.name).join(", "));
```

```
entities: Person, Company
mappings: employer
attrs: name
operations: uppercase
```

A `Mapping` ends on an `Entity` (`Hom(Entity)`), so pointing its codomain at an
attribute type is a compile error.

```ts
// @ts-expect-error A mapping's codomain must be an Entity cell, not an AttrType cell.
notebook.add(Mapping, {
    name: "bad",
    dom: person,
    cod: str,
});
```

Likewise an `Operation` goes between attribute types (`Hom(AttrType)`), so an
entity domain is rejected.

```ts
// @ts-expect-error An operation's domain must be an AttrType cell, not an Entity cell.
notebook.add(Operation, {
    name: "bad",
    dom: person,
    cod: str,
});
```
