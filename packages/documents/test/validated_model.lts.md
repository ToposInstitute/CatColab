# Validated models

A notebook is an editable document. Once validated, its elaborated model is a
read-only view of the mathematical judgments represented by that document.
Validated models retain the notebook's shape, so they can be queried with the
same object and morphism definitions used to edit the notebook.

## Querying judgments by type

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { createBinder } from "catcolab-documents";
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";

const binder = createBinder();
const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
const person = schema.add(Entity, { label: "Person" });
const company = schema.add(Entity, { label: "Company" });
const str = schema.add(AttrType, { label: "String" });
schema.add(Mapping, { label: "employer", from: person, to: company });
schema.add(Attr, { label: "name", from: person, to: str });

const validation = await schema.validate();
if (validation.tag !== "Ok") {
    throw new Error("Schema failed to validate");
}
const model = validation.content;
```

`judgmentsOf` returns the existing elaborated presentation records. Object
definitions select object generators and morphism definitions select morphism
generators, retaining their qualified identifiers, labels, types, and
endpoints.

```ts
const entities = model.judgmentsOf(Entity);
const mappings = model.judgmentsOf(Mapping);
const attributes = model.judgmentsOf(Attr);

console.log("entities:", entities.map((judgment) => judgment.label?.join(".")).join(", "));
console.log("mapping:", mappings[0]?.label?.join("."));
console.log("attribute:", attributes[0]?.label?.join("."));
console.log("all objects:", model.obGenerators().length);
```

```
entities: Person, Company
mapping: employer
attribute: name
all objects: 3
```

A single judgment can be looked up by its definition and identifier. Like
`Notebook.get`, this returns a `Result` that distinguishes a successful lookup
from a missing identifier or a judgment of the wrong type.

```ts
const validatedPerson = model.get(Entity, person.id);
console.log("found person:", validatedPerson.tag === "Ok");

const wrongType = model.get(AttrType, person.id);
console.log("wrong type:", wrongType.tag);
```

```
found person: true
wrong type: Err
```

The shape is retained through validation. A validated schema cannot be queried
with a definition from another logic.

```ts
import { Place } from "catcolab-logics/petri-net";

// @ts-expect-error Place is not an object definition in SimpleSchema.
model.judgmentsOf(Place);
```

## Using judgments with an instance

An elaborated object judgment can be passed directly to the instance API. No
cast back to a notebook cell is needed.

<!-- verifier:prepend-to-following -->

```ts
const instance = await binder.createInstance(schema, { title: "Company data" });
const validatedPerson = model.get(Entity, person.id);
if (validatedPerson.tag === "Err") {
    throw new Error(validatedPerson.content.map((issue) => issue.message).join("; "));
}

instance.add(validatedPerson.content, { name: "Alice" });

console.log("person rows:", instance.rowsOf(validatedPerson.content).length);
console.log("name:", instance.rowsOf(validatedPerson.content)[0]?.values["name"]);
```

```
person rows: 1
name: Alice
```

## Imported judgments

Validated models include judgments from instantiated models. They remain
queryable and can be used directly as tables and columns in an instance.

<!-- verifier:reset -->

```ts
import { createBinder, Instantiation } from "catcolab-documents";
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";

const binder = createBinder();
const imported = await binder.createNotebook(SimpleSchema, { title: "Imported" });
const external = imported.add(Entity, { label: "External" });
const string = imported.add(AttrType, { label: "String" });
imported.add(Attr, { label: "name", from: external, to: string });

const root = await binder.createNotebook(SimpleSchema, { title: "Root" });
root.add(Entity, { label: "Local" });
root.add(Instantiation, { label: "Import", model: imported });

const validation = await root.validate();
if (validation.tag !== "Ok") {
    throw new Error("Root schema failed to validate");
}

const importedEntity = validation.content
    .judgmentsOf(Entity)
    .find((judgment) => judgment.label?.join(".") === "Import.External");
if (!importedEntity) {
    throw new Error("Imported entity is missing");
}

const instance = await binder.createInstance(root, { title: "Root data" });
const row = instance.add(importedEntity, { name: "Remote" });
const instanceValidation = await instance.validate();

console.log("rows:", instance.rowsOf(importedEntity).length);
console.log("name:", row.values["Import.name"]);
console.log("valid:", instanceValidation.tag);
```

```
rows: 1
name: Remote
valid: Valid
```
