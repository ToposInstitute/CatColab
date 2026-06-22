# Defining a schema shape

A shape declares a notebook's object and morphism types as tagged wrappers built
with `defineObject`/`defineMorphism`. A `Hom` morphism's endpoint object type and
arity are read from its `MorType` structure. A `Basic` morphism records no
endpoints in its literal, so it must declare them with
`defineMorphism(morType, { domObType, codObType })`; a bare `Basic` literal is not a
`MorphismDef` and is a compile error.

<!-- verifier:prepend-to-following -->

```ts
import { defineMorphism, defineObject, defineShape } from "catcolab-documents";
import { ThSchema } from "catlog-wasm";

const Entity = defineObject({ tag: "Basic", content: "Entity" });
const AttrType = defineObject({ tag: "Basic", content: "AttrType" });

// `Hom(Entity)`: a mapping between entities; endpoints are `Entity` cells.
const Mapping = defineMorphism({ tag: "Hom", content: Entity.obType });
// A `Basic` morphism records no endpoints, so they are declared here:
// an `Attr` goes from an `Entity` to an `AttrType`.
const Attr = defineMorphism(
    { tag: "Basic", content: "Attr" },
    { domObType: Entity.obType, codObType: AttrType.obType },
);
// `Hom(AttrType)`: an operation between attribute types.
const Operation = defineMorphism({ tag: "Hom", content: AttrType.obType });

const SimpleSchema = defineShape({
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    objects: [Entity, AttrType],
    morphisms: [Mapping, Attr, Operation],
});
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

The `defineMorphism(...)` declaration types an `Attr`'s endpoints just like a
`Hom`: its domain is an `Entity` and its codomain an `AttrType`, so swapping them
is a compile error even though `Attr` is a `Basic` morphism.

```ts
// @ts-expect-error An attr's domain must be an Entity cell and its codomain an AttrType cell.
notebook.add(Attr, {
    name: "bad",
    dom: str,
    cod: person,
});
```

A bare `Basic` morphism literal is not a `MorphismDef`, so passing one in a
shape's `morphisms` list (instead of wrapping it with `defineMorphism`) is a
compile error.

```ts
defineShape({
    theory: "missing-endpoints",
    coreTheory: SimpleSchema.coreTheory,
    objects: [Entity],
    morphisms: [
        // @ts-expect-error A Basic morphism must be wrapped with defineMorphism(morType, { domObType, codObType }).
        { tag: "Basic", content: "Attr" },
    ],
});
```
