# Instance documents

An _instance_ is a database of a schema: where a schema declares entities,
mappings, and attributes, an instance holds the actual _rows_. It is created
from a schema notebook with `binder.createInstance`, and `add` inserts a row for
a schema entity, wiring the schema's mappings and attributes inline.

First we build a schema.

<!-- verifier:reset -->

<!-- verifier:prepend-to-following -->

```ts
import { createBinder } from "catcolab-documents";
const binder = createBinder();
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";

const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
const person = schema.add(Entity, { label: "Person" });
const company = schema.add(Entity, { label: "Company" });
const str = schema.add(AttrType, { label: "String" });

schema.add(Mapping, { label: "employer", from: person, to: company });
schema.add(Attr, { label: "name", from: person, to: str });
```

An instance is created from the schema itself — it takes its shape and its
reference to the schema from that notebook, so we pass only a name.

<!-- verifier:prepend-to-following -->

```ts
const instance = await binder.createInstance(schema, { title: "Company instance" });

const acme = instance.add(company, {});
const fred = instance.add(person, { name: "Fred", employer: acme });
```

`instance.add(company, {})` inserts a `Company` row. `instance.add(person, {
name: "Fred", employer: acme })` inserts a `Person` row, then reads the schema's
outgoing mappings and attributes by name: `employer` (a mapping) points the row
at `acme`, while `name` (an attribute) records the literal `"Fred"`. Rows are
never named.

```ts
console.log("theory:", instance.theory);
console.log("fred entity:", fred.entity.label);
console.log("acme entity:", acme.entity.label);
```

```
theory: simple-schema
fred entity: Person
acme entity: Company
```

We can list the instance's rows with `rows()`, or just those of one entity with
`rowsOf(entity)`, and read a row's mapping and attribute values.

```ts
import type { Row } from "catcolab-documents";

console.log("row count:", instance.rows().length);
console.log("person rows:", instance.rowsOf(person).length);

const values = fred.values;
const employer = values["employer"] as Row;
console.log("name:", values["name"]);
console.log("employer is acme:", employer.id === acme.id);
console.log("employer entity:", employer.entity.label);
```

```
row count: 2
person rows: 1
name: Fred
employer is acme: true
employer entity: Company
```

Finally, the instance validates against its schema.

```ts
const result = await instance.validate();
console.log("valid:", result.tag);
```

```
valid: Valid
```
