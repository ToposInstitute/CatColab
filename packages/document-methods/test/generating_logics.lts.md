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

<!-- verifier:typescript-errors -->

```ts
const employer = notebook.add(Mapping, { name: "employer2", dom: person, cod: company });

employer.update({
    cod: str,
});
```

```txt
error TS2345: Argument of type '{ cod: ObjectCell<ObjectType<"AttrType">>; }' is not assignable to parameter of type '{ cod: ObjectCell<ObjectType<"AttrType">>; } & FieldError<"cod", "Unexpected value shape.">'.
  Property '"Type error: cod"' is missing in type '{ cod: ObjectCell<ObjectType<"AttrType">>; }' but required in type 'FieldError<"cod", "Unexpected value shape.">'.
```

<!-- verifier:typescript-errors -->

```ts
const nameAttr = notebook.add(Attr, { name: "name2", dom: person, cod: str });

nameAttr.update({
    dom: str,
});
```

```txt
error TS2345: Argument of type '{ dom: ObjectCell<ObjectType<"AttrType">>; }' is not assignable to parameter of type '{ dom: ObjectCell<ObjectType<"AttrType">>; } & FieldError<"dom", "Unexpected value shape.">'.
  Property '"Type error: dom"' is missing in type '{ dom: ObjectCell<ObjectType<"AttrType">>; }' but required in type 'FieldError<"dom", "Unexpected value shape.">'.
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
error TS2345: Argument of type '{ dom: ObjectCell<ObjectType<"Place">>; }' is not assignable to parameter of type '{ dom: ObjectCell<ObjectType<"Place">>; } & FieldError<"dom", "Expected an array, not a single object.">'.
  Property '"Type error: dom"' is missing in type '{ dom: ObjectCell<ObjectType<"Place">>; }' but required in type 'FieldError<"dom", "Expected an array, not a single object.">'.
```
