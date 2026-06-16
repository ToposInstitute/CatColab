# Generating logics

A logic can be defined from a compact specification. The generator produces the
typed cell constructors and the `ModelLogic` value used by notebooks.

<!-- verifier:prepend-to-following -->

```ts
import { defineModelLogic, binder, byType } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";
import { ThSchema } from "catlog-wasm";

const entityObType: ObType = { tag: "Basic", content: "Entity" };
const attrTypeObType: ObType = { tag: "Basic", content: "AttrType" };

const mappingMorType: MorType = { tag: "Hom", content: entityObType };
const attrMorType: MorType = { tag: "Basic", content: "Attr" };
const operationMorType: MorType = { tag: "Hom", content: attrTypeObType };

const SimpleSchema = defineModelLogic({
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    objects: {
        Entity: entityObType,
        AttrType: attrTypeObType,
    },
    morphisms: {
        Mapping: { dom: "Entity", cod: "Entity", morType: mappingMorType },
        Attr: { dom: "Entity", cod: "AttrType", morType: attrMorType },
        Operation: { dom: "AttrType", cod: "AttrType", morType: operationMorType },
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

Logic definitions use explicit core types from `catcolab-document-types`; object
string shorthand and omitted morphism types are rejected.

<!-- verifier:typescript-errors -->

```ts
defineModelLogic({
    theory: "bad-object-shorthand",
    coreTheory: SimpleSchema.coreTheory,
    objects: {
        Entity: "Entity",
    },
    morphisms: {
        Mapping: { dom: "Entity", cod: "Entity", morType: mappingMorType },
    },
});
```

```txt
error TS2322: Type 'string' is not assignable to type 'ObType'.
```

<!-- verifier:typescript-errors -->

```ts
defineModelLogic({
    theory: "bad-missing-mor-type",
    coreTheory: SimpleSchema.coreTheory,
    objects: {
        Entity: entityObType,
    },
    morphisms: {
        Mapping: { dom: "Entity", cod: "Entity" },
    },
});
```

```txt
error TS2741: Property 'morType' is missing in type '{ dom: "Entity"; cod: "Entity"; }' but required in type 'GeneratedMorphismSpec<{ readonly Entity: { tag: "Basic"; content: string; }; }>'.
```

<!-- verifier:typescript-errors -->

```ts
const employer = notebook.add(Mapping, { name: "employer2", dom: person, cod: company });

employer.update({
    cod: str,
});
```

```txt
error TS2345: Type error: cod: Expected object cell of type "Entity", got "AttrType".
```

<!-- verifier:typescript-errors -->

```ts
const nameAttr = notebook.add(Attr, { name: "name2", dom: person, cod: str });

nameAttr.update({
    dom: str,
});
```

```txt
error TS2345: Type error: dom: Expected object cell of type "Entity", got "AttrType".
```

Array endpoints are written with a single-element tuple in the logic definition.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { defineModelLogic, binder } from "catcolab-documents";
import type { MorType, ObType } from "catcolab-document-types";
import { ThSymMonoidalCategory } from "catlog-wasm";

const placeObType: ObType = { tag: "Basic", content: "Object" };
const transitionMorType: MorType = { tag: "Hom", content: placeObType };

const PetriNet = defineModelLogic({
    theory: "petri-net",
    coreTheory: new ThSymMonoidalCategory().theory(),
    objects: {
        Place: placeObType,
    },
    morphisms: {
        Transition: { dom: ["Place"], cod: ["Place"], morType: transitionMorType },
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

<!-- verifier:typescript-errors -->

```ts
const fires = notebook.add(Transition, {
    name: "fires2",
    dom: [a],
    cod: [b],
});

fires.update({
    dom: a,
});
```

```txt
error TS2345: Type error: dom: Expected an array, not a single object.
```
