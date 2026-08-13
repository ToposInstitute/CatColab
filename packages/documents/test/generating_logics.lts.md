# Defining shapes from a compact spec

A shape is defined from a compact specification of object and morphism types,
built with `defineObject`/`defineMorphism`. A `Hom` morphism's endpoint object
type and arity are read from its `MorType` structure; a `Basic` morphism records
no endpoints in its literal, so it declares them with `defineMorphism(morType, { domain, codomain })`, passing each endpoint's `ObType`.

<!-- verifier:prepend-to-following -->

```ts
import { createBinder, defineMorphism, defineObject, defineShape } from "catcolab-documents";
const binder = createBinder();

const Entity = defineObject({ tag: "Basic", content: "Entity" });
const AttrType = defineObject({ tag: "Basic", content: "AttrType" });

const Mapping = defineMorphism({ tag: "Hom", content: Entity.obType });
const Attr = defineMorphism(
    { tag: "Basic", content: "Attr" },
    { domain: Entity.obType, codomain: AttrType.obType },
);
const Operation = defineMorphism({ tag: "Hom", content: AttrType.obType });

const SimpleSchema = defineShape({
    theory: "simple-schema",
    getCoreTheory: async () => {
        const { ThSchema } = await import("catlog-wasm");
        return new ThSchema().theory();
    },
    objects: [Entity, AttrType],
    morphisms: [Mapping, Attr, Operation],
});
```

<!-- verifier:prepend-to-following -->

```ts
const notebook = await binder.createNotebook(SimpleSchema, { title: "Company schema" });

const person = notebook.add(Entity, { label: "Person" });
const company = notebook.add(Entity, { label: "Company" });
const str = notebook.add(AttrType, { label: "String" });
const upper = notebook.add(AttrType, { label: "UpperString" });

notebook.add(Mapping, { label: "employer", from: person, to: company });
notebook.add(Attr, { label: "name", from: person, to: str });
notebook.add(Operation, { label: "uppercase", from: str, to: upper });
```

```ts
const entities = notebook.cellsOf(Entity);
const operations = notebook.cellsOf(Operation);

console.log("entities:", entities.map((cell) => cell.label).join(", "));
console.log("operations:", operations.map((cell) => cell.label).join(", "));
```

```
entities: Person, Company
operations: uppercase
```

Object defs must be built with `defineObject`, not string shorthand.

```ts
defineShape({
    theory: "bad-object-shorthand",
    getCoreTheory: SimpleSchema.getCoreTheory,
    // @ts-expect-error Object defs must be built with defineObject, not strings.
    objects: ["Entity"],
    morphisms: [],
});
```

Endpoint types are inferred from each morphism's `MorType`. A `Mapping` is
`Hom(Entity)`, so its endpoints are `Entity` cells; wiring its codomain to an
attribute type is rejected.

```ts
const employer = notebook.add(Mapping, { label: "employer2", from: person, to: company });

// @ts-expect-error A mapping's codomain must be an Entity cell, not an AttrType cell.
employer.update({ to: str });
```

An `Operation` is `Hom(AttrType)`, so its domain must be an attribute type.

```ts
// @ts-expect-error An operation's domain must be an AttrType cell, not an Entity cell.
notebook.add(Operation, { label: "op2", from: person, to: str });
```

Endpoint arity is taken from the declared list `modality`: a `Hom` morphism
given a modality such as `SymmetricList` produces array-valued endpoints.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { createBinder, defineMorphism, defineObject, defineShape } from "catcolab-documents";
const binder = createBinder();

const Place = defineObject({ tag: "Basic", content: "Object" });
const Transition = defineMorphism(
    { tag: "Hom", content: Place.obType },
    {
        domain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
        codomain: { apply: { tag: "Basic", content: "tensor" }, modality: "SymmetricList" },
    },
);

const PetriNet = defineShape({
    theory: "petri-net",
    getCoreTheory: async () => {
        const { ThSymMonoidalCategory } = await import("catlog-wasm");
        return new ThSymMonoidalCategory().theory();
    },
    objects: [Place],
    morphisms: [Transition],
});
```

<!-- verifier:prepend-to-following -->

```ts
const notebook = await binder.createNotebook(PetriNet, { title: "Petri net" });
const a = notebook.add(Place, { label: "A" });
const b = notebook.add(Place, { label: "B" });

notebook.add(Transition, {
    label: "fires",
    from: [a],
    to: [b],
});
```

A transition's endpoints are arrays of places, so a single place is rejected.

```ts
const fires = notebook.add(Transition, { label: "fires2", from: [a], to: [b] });

// @ts-expect-error A transition endpoint is an array of places, not a single place.
fires.update({ from: a });
```
