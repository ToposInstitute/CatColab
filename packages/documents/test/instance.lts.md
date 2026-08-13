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
reference to the schema from that notebook, so we pass only a name. `tables()`
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
const instance = await binder.createInstance(schema, { title: "Company instance" });

const tables = await instance.tables();
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
    console.log(`${header.label} (${header.type.tag})${targetTable ? ` -> ${targetTable.label}` : ""}`);
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

## Cells

Rows know their position: `row.index` is the row's 0-based position in its
table's row order. A row's `cells` list one `TableCell` per header,
positionally aligned with the table's `headers`, each tagged for pattern
matching — with `ts-pattern`, or plain narrowing as here. An unset header is
`{ tag: "Null" }`; an attribute is its tagged literal
(`{ tag: "String", content: … }`, `{ tag: "Int", … }`, …), and a mapping holds
the linked target row under `{ tag: "RowRef" }`.

```ts
import type { TableCell } from "catcolab-documents";

const cellText = (cell: TableCell): string => {
    switch (cell.tag) {
        case "Null":
            return "(unset)";
        case "RowRef":
            return `#${cell.content.index + 1}`;
        case "DanglingRowRef":
        case "MistypedRowRef":
        case "MistypedLiteral":
            return "(invalid)";
        default:
            return String(cell.content);
    }
};

const fredCells = () => fred.cells.map(cellText).join(", ");
console.log("index:", fred.index);
console.log("cells:", fredCells());

fred.update({ name: "Frederick" });
console.log("after set:", fredCells());

fred.set(name, null);
console.log("after clear:", fredCells());
```

```
index: 0
cells: #1, Fred
after set: #1, Frederick
after clear: #1, (unset)
```

A cell is either _valid_ — its stored value fits its header's current schema —
or _invalid_: the linked target row was deleted (`DanglingRowRef`, carrying
the stored uuid), the header no longer accepts the linked row
(`MistypedRowRef`: the header is now an attribute, or a mapping into a
different table), or a literal sits under a header that is now a mapping
(`MistypedLiteral`). Invalid values are retained in the document and reported
by validation, and since cells are live views they heal on re-read when the
schema or the linked row is restored. `isCellValid` narrows the union.

```ts
import { isCellValid } from "catcolab-documents";

console.log("all valid:", fred.cells.every(isCellValid));
```

```
all valid: true
```

Finally, the instance validates against its schema.

```ts
const result = await instance.validate();
console.log("valid:", result.tag);
```

```
valid: Ok
```
