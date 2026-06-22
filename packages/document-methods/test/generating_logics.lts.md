# Defining shapes from a compact spec

A shape is defined from a compact specification of object and morphism types,
given as plain `ObType`/`MorType` literals. A `Hom` morphism's endpoint object
type and arity are read from its `MorType` structure; a `Basic` morphism records
no endpoints in its literal, so it declares them with `basicMorphism(name, dom, cod)`.

<!-- verifier:prepend-to-following -->

```ts
import {
    basicMorphism,
    binder,
    byMorphismType,
    byObjectType,
    defineShape,
} from "catcolab-documents";
import { ThSchema } from "catlog-wasm";

const Entity = { tag: "Basic", content: "Entity" } as const;
const AttrType = { tag: "Basic", content: "AttrType" } as const;

const Mapping = { tag: "Hom", content: Entity } as const;
const Attr = basicMorphism("Attr", Entity, AttrType);
const Operation = { tag: "Hom", content: AttrType } as const;

const SimpleSchema = defineShape({
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    objects: [Entity, AttrType],
    morphisms: [Mapping, Attr, Operation],
});
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

```ts
const entities = notebook.cells().filter(byObjectType(Entity));
const operations = notebook.cells().filter(byMorphismType(Operation));

console.log("entities:", entities.map((cell) => cell.name).join(", "));
console.log("operations:", operations.map((cell) => cell.name).join(", "));
```

```txt
entities: Person, Company
operations: uppercase
```

Object types must be `ObType` values, not string shorthand.

```ts
defineShape({
    theory: "bad-object-shorthand",
    coreTheory: SimpleSchema.coreTheory,
    // @ts-expect-error Object types must be `ObType` values, not strings.
    objects: ["Entity"],
    morphisms: [],
});
```

Endpoint types are inferred from each morphism's `MorType`. A `Mapping` is
`Hom(Entity)`, so its endpoints are `Entity` cells; wiring its codomain to an
attribute type is rejected.

```ts
const employer = notebook.add(Mapping, { name: "employer2", dom: person, cod: company });

// @ts-expect-error A mapping's codomain must be an Entity cell, not an AttrType cell.
employer.update({ cod: str });
```

An `Operation` is `Hom(AttrType)`, so its domain must be an attribute type.

```ts
// @ts-expect-error An operation's domain must be an AttrType cell, not an Entity cell.
notebook.add(Operation, { name: "op2", dom: person, cod: str });
```

Endpoint arity is taken from the morphism type: a `Hom` over a list modality
such as `SymmetricList` produces array-valued endpoints.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { binder, defineShape } from "catcolab-documents";
import { ThSymMonoidalCategory } from "catlog-wasm";

const Place = { tag: "Basic", content: "Object" } as const;
const Transition = {
    tag: "Hom",
    content: {
        tag: "ModeApp",
        content: { modality: "SymmetricList", obType: Place },
    },
} as const;

const PetriNet = defineShape({
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    objects: [Place],
    morphisms: [Transition],
});
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

A transition's endpoints are arrays of places, so a single place is rejected.

```ts
const fires = notebook.add(Transition, { name: "fires2", dom: [a], cod: [b] });

// @ts-expect-error A transition endpoint is an array of places, not a single place.
fires.update({ dom: a });
```
