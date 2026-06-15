<!-- verifier:prepend-to-following -->

```ts
import type { ModelLogic, MorphismType, ObjectCell, ObjectType } from "catcolab-documents";
import { morphismType, objectType } from "catcolab-documents";

type EntityType = ObjectType<"Entity">;
type AttrTypeType = ObjectType<"AttrType">;
type MappingType = MorphismType<ObjectCell<EntityType>, ObjectCell<EntityType>, "Mapping">;
type AttrMorphismType = MorphismType<ObjectCell<EntityType>, ObjectCell<AttrTypeType>, "Attr">;
type OperationType = MorphismType<ObjectCell<AttrTypeType>, ObjectCell<AttrTypeType>, "Operation">;
```

<!-- verifier:prepend-to-following -->

```ts
const Entity: EntityType = objectType<"Entity">("Entity");
const AttrType: AttrTypeType = objectType<"AttrType">("AttrType");

const Mapping: MappingType = morphismType<
    ObjectCell<EntityType>,
    ObjectCell<EntityType>,
    "Mapping"
>({
    tag: "Hom",
    content: { tag: "Basic", content: "Entity" },
});

const Attr: AttrMorphismType = morphismType<
    ObjectCell<EntityType>,
    ObjectCell<AttrTypeType>,
    "Attr"
>({
    tag: "Basic",
    content: "Attr",
});

const Operation: OperationType = morphismType<
    ObjectCell<AttrTypeType>,
    ObjectCell<AttrTypeType>,
    "Operation"
>({
    tag: "Hom",
    content: { tag: "Basic", content: "AttrType" },
});
```

<!-- verifier:prepend-to-following -->

```ts
import { ThSchema } from "catlog-wasm";

const SimpleSchema = {
    theory: "simple-schema",
    coreTheory: new ThSchema().theory(),
    cellTypes: { Entity, AttrType, Mapping, Attr, Operation },
} satisfies ModelLogic<
    "simple-schema",
    {
        Entity: EntityType;
        AttrType: AttrTypeType;
        Mapping: MappingType;
        Attr: AttrMorphismType;
        Operation: OperationType;
    }
>;
```

<!-- verifier:prepend-to-following -->

```ts
import { binder, byType } from "catcolab-documents";

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
const entities = notebook.cells().filter(byType(Entity));
const mappings = notebook.cells().filter(byType(Mapping));
const attrs = notebook.cells().filter(byType(Attr));
const operations = notebook.cells().filter(byType(Operation));

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

```ts
// @ts-expect-error A mapping's codomain must be an entity, not an attribute type.
notebook.add(Mapping, {
    name: "bad",
    dom: person,
    cod: str,
});
```

```ts
// @ts-expect-error An attribute's domain must be an entity, not an attribute type.
notebook.add(Attr, {
    name: "bad",
    dom: str,
    cod: str,
});
```
