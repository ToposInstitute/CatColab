# Instance documents

An _instance_ is a database of a schema: where a schema declares entities,
mappings, and attributes, an instance holds the actual _rows_. It is created
from a schema notebook with `binder.createInstance` and edited through its
_tables_, one per schema entity.

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

const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
const name = schema.add(Attr, { label: "name", from: person, to: str });
```

## Tables

An instance is created from the schema itself — it takes its shape and its
reference to the schema from that notebook, so we pass only a name. `tables`
lists the instance as a database: one table per row-bearing schema entity, in
schema order — imported entities included, and an entity with no rows yet gets
an empty table. The elaborated schema is resolved internally, so no prior
`validate()` call is needed. A table whose entity was deleted from the schema
is hidden, though its data is retained in the document and reappears if the
entity is restored.

Rows are never named. They are inserted through a table with `addRow`, and
their values are written through the row with `set`, keyed by the schema's
mapping/attribute cell (a table header works too): a mapping takes a target
row, an attribute a literal, and `null` clears the column.

<!-- verifier:prepend-to-following -->

```ts
const instanceDoc = await binder.createInstance(schema, { title: "Company instance" });
const initialValidation = await instanceDoc.validate();
if (initialValidation.tag !== "Ok") {
    throw new Error("Instance failed to validate");
}
const instance = initialValidation.content.instance;

const tables = instance.tables;
const personTable = tables.find((table) => table.label === "Person");
const companyTable = tables.find((table) => table.label === "Company");
if (!personTable || !companyTable) {
    throw new Error("expected Person and Company tables");
}

const acme = companyTable.addRow();
const fred = personTable.addRow();
fred.set(employer, acme);
fred.set(name, "Fred");
```

A table's `headers` are the schema morphisms out of its entity. Each header's
tagged `type` is either a literal type or a `RowRef` carrying the target table's
entity UUID. `rows` are live row handles, in stored order.

```ts
console.log("tables:", tables.map((table) => table.label).join(", "));
for (const header of personTable.headers) {
    const targetId = header.type.tag === "RowRef" ? header.type.content.id : undefined;
    const targetTable = tables.find((table) => table.id === targetId);
    console.log(
        `${header.label} (${header.type.tag})${targetTable ? ` -> ${targetTable.label}` : ""}`,
    );
}
console.log("person rows:", personTable.rows.length);

personTable.addRow();
console.log("after addRow:", personTable.rows.length);
personTable.rows[1]!.delete();
console.log("after delete:", personTable.rows.length);
```

```
tables: Person, Company
employer (RowRef) -> Company
name (String)
person rows: 1
after addRow: 2
after delete: 1
```

## Fields

Rows know their position: `row.index` is the row's 0-based position in its
table's row order. A row's `fields` list one `FieldValue` per header,
positionally aligned with the table's `headers`. Each value contains its UUID
path, while a literal has a `value` and a mapping has the linked row's `id`.

```ts
import type { FieldValue } from "catcolab-documents";

const fieldText = (field: FieldValue): string => {
    switch (field.tag) {
        case "Null":
            return "(unset)";
        case "RowRef":
            return "(row)";
        default:
            return String(field.content.value);
    }
};

const fredFields = () => fred.fields.map(fieldText).join(", ");
console.log("index:", fred.index);
console.log("fields:", fredFields());

fred.update({ name: "Frederick" });
console.log("after set:", fredFields());

fred.set(name, null);
console.log("after clear:", fredFields());
```

```
index: 0
fields: (row), Fred
after set: (row), Frederick
after clear: (row), (unset)
```

Invalid values are retained in the document and reported by the document's `validate()` as
field issues. Each issue's `path` identifies the affected field.

Finally, the instance validates against its schema.

```ts
const result = await instanceDoc.validate();
console.log("valid:", result.tag);
```

```
valid: Ok
```
