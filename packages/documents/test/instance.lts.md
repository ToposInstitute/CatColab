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

## Tables

An instance is a database, and `tables()` lists it as one: one table per
row-bearing schema entity, in schema order — imported entities included, and an
entity with no rows yet gets an empty table. The elaborated schema is resolved
internally, so no prior `validate()` call is needed. A table whose entity was
deleted from the schema is hidden, though its data is retained in the document
and reappears if the entity is restored.

<!-- verifier:prepend-to-following -->

```ts
const tables = await instance.tables();
const personTable = tables.find((table) => table.label === "Person");
if (!personTable) {
    throw new Error("expected a Person table");
}
```

A table's `columns` are the schema morphisms out of its entity, each pointing
at its codomain object via `to`; its `rows` are the same live row handles
`rowsOf` returns, in stored order. Rows are inserted through the table itself
with `addRow` — or through the instance (`add`, alias `addRow`), where the
table works directly as the entity ref, since its `id` is its entity's.

```ts
console.log("tables:", tables.map((table) => table.label).join(", "));
for (const column of personTable.columns) {
    console.log(`${column.label} -> ${column.to?.label}`);
}
console.log("person rows:", personTable.rows.length);

personTable.addRow();
console.log("after addRow:", personTable.rows.length);
```

```
tables: Person, Company
employer -> Company
name -> String
person rows: 1
after addRow: 2
```

## Cells

Rows know their position: `row.index` is the row's 0-based position in its
table's row order (and `-1` once the row is deleted). A row's `cells` list one
`TableCell` per column, positionally aligned with the table's `columns`: an
unset column is `"Null"`, an attribute is its tagged literal (`{ String: … }`,
`{ Int: … }`, …), and a mapping holds the linked row itself under `Row`. The
shape mirrors the stored Rust `FieldValue` and is made to be pattern matched —
with `ts-pattern`, or plain narrowing as here. Values are written through the
row with `set`, keyed by the column itself.

```ts
import type { TableCell } from "catcolab-documents";

const cellText = (cell: TableCell): string => {
    if (cell === "Null") {
        return "(unset)";
    }
    if ("Row" in cell) {
        return `#${cell.Row.index + 1} of ${cell.Row.entity.label}`;
    }
    if ("Bool" in cell) {
        return String(cell.Bool);
    }
    if ("Int" in cell) {
        return String(cell.Int);
    }
    if ("Float" in cell) {
        return String(cell.Float);
    }
    return cell.String;
};

const fredRow = personTable.rows[0];
const nameColumn = personTable.columns.find((column) => column.label === "name");
if (!fredRow || !nameColumn) {
    throw new Error("expected Fred's row and the name column");
}

console.log("index:", fredRow.index);
console.log("cells:", fredRow.cells.map(cellText).join(", "));

fredRow.set(nameColumn, "Frederick");
console.log("after set:", fredRow.cells.map(cellText).join(", "));

fredRow.set(nameColumn, undefined);
console.log("after clear:", fredRow.cells.map(cellText).join(", "));
```

```
index: 0
cells: #1 of Company, Fred
after set: #1 of Company, Frederick
after clear: #1 of Company, (unset)
```

Finally, the instance validates against its schema.

```ts
const result = await instance.validate();
console.log("valid:", result.tag);
```

```
valid: Valid
```
