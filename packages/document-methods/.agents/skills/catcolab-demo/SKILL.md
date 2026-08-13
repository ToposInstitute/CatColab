---
name: catcolab-instances-demo-script
description: Drive the CatColab instances demo by running its script via the WebMCP `run_script` tool over Chrome DevTools. Use when you need to programmatically build or edit the demo's schema and instance (entities, mappings, attributes, and rows) in a running browser.
---

# CatColab instances demo: scripting via WebMCP + Chrome DevTools

The instances demo (`pnpm demo` in `packages/document-methods`) exposes a single
WebMCP tool, `run_script`, on `document.modelContext`. It writes JavaScript into
the demo's script editor, opens the script pane, and **runs it**, returning the
script's return value (or thrown error). This skill covers driving that tool
through the Chrome DevTools MCP and what the script may contain.

## Prerequisites

- The demo dev server is running (default `http://localhost:5173/`). It is
  usually already running; check first.
- A Chrome DevTools MCP connection to that page.

The page installs the WebMCP polyfill at startup, so `document.modelContext`
exists app-wide and `run_script` is registered even when the script pane is
closed.

## Using `run_script` over Chrome DevTools

Chrome DevTools MCP has no direct WebMCP bridge, so call the tool through
`evaluate_script`, which runs in the page and can reach `document.modelContext`.

1. Navigate to the demo (only if not already there):

    `navigate_page` -> `http://localhost:5173/`

2. (Optional) List tools to confirm registration:

    ```js
    () =>
        document.modelContext
            .getTools()
            .then((ts) => ts.map((t) => ({ name: t.name, inputSchema: t.inputSchema })));
    ```

    Expect a `run_script` tool whose `inputSchema` (returned as a JSON string)
    describes a single required `script` string property.

3. Execute it. `executeTool` takes a tool descriptor from `getTools()` and a
   **JSON string** of arguments, and returns a JSON string:

    ```js
    async () => {
        const mc = document.modelContext;
        const tool = (await mc.getTools()).find((t) => t.name === "run_script");
        return mc.executeTool(
            tool,
            JSON.stringify({
                script:
                    `const p = schema.add(Entity, { label: "Person" });\n` +
                    `schema.add(Attr, { label: "name", from: p, to: attrTypes.String });\n`,
            }),
        );
    };
    ```

    On success it returns
    `{"content":[{"type":"text","text":"Script ran successfully."}]}` (with the
    returned value appended, if the script returned one), and the script pane
    opens with the source shown. If the script throws, the result is an error
    with the message `Script threw: …`.

4. Verify (optional). There are two `<textarea>`s on the page (one belongs to
   the instance grid); the script editor is the one holding your source:

    ```js
    () => [...document.querySelectorAll("textarea")].map((t) => t.value);
    ```

    The source is also persisted to `localStorage["catcolab-instances-demo:script"]`.

Notes:

- `run_script` executes the script immediately: the schema and instance update
  as soon as the tool returns. No human Run press is needed.
- Calling it again replaces the editor contents and runs the new script.

## What can go in the script

The script body runs inside an `async` function (so you may use top-level
`await`) with these names in scope:

| Name        | What it is                                                                   |
| ----------- | ---------------------------------------------------------------------------- |
| `schema`    | The schema notebook (a `Notebook` over `SimpleSchema`).                      |
| `instance`  | The instance (a database of `schema`).                                       |
| `doc`       | The demo document wrapper (`{ schema, instance, attrTypes, … }`).            |
| `attrTypes` | `{ String, Boolean, Integer, Float }` — the four fixed attribute-type cells. |
| `Entity`    | Object def: an entity (a table).                                             |
| `Mapping`   | Morphism def: a foreign key `Entity -> Entity`.                              |
| `Attr`      | Morphism def: an attribute `Entity -> AttrType`.                             |
| `AttrType`  | Object def for attribute types (`String`/`Boolean`/`Integer`/`Float`).       |

Every mutation goes through the same document API the UI uses, so the notebook,
instance tables, history, and persistence all update as with point-and-click
edits. The script has full access to the page (it is a demo affordance, not a
sandbox).

> **Always reset first.** Scripts are additive and the schema/instance persist
> across runs (via `localStorage`), so building on top of whatever is already
> there produces duplicate cells and rows. Unless the human explicitly asks to
> extend the current state, begin every schema-building script with the reset
> block from [Resetting the schema](#resetting-the-schema), which deletes every
> cell except the two fixed `AttrType` cells.

### Schema API (`schema`)

```js
// Add cells. Each returns a live cell handle.
const person = schema.add(Entity, { label: "Person" });
const company = schema.add(Entity, { label: "Company" });
const name = schema.add(Attr, { label: "name", from: person, to: attrTypes.String });
const age = schema.add(Attr, { label: "age", from: person, to: attrTypes.Integer });
const employer = schema.add(Mapping, { label: "employer", from: person, to: company });

// List cells of a kind.
schema.cellsOf(Entity); // -> entity cells
schema.cellsOf(Attr); // -> attribute cells
schema.cellsOf(Mapping); // -> mapping cells

// Edit / remove a cell.
person.update({ label: "Human" });
employer.update({ to: company }); // change a mapping's codomain
age.delete(); // remove a cell
```

Attribute codomains must be one of `attrTypes.String`, `attrTypes.Boolean`,
`attrTypes.Integer`, or `attrTypes.Float` (there is no `attrTypes.Number`). A
`Mapping`'s `from`/`to` are `Entity` cells; an `Attr`'s `from` is an `Entity`
cell and `to` is an `attrTypes` cell.

#### Resetting the schema

To start from a clean schema, delete every cell **except** the `AttrType` cells.
The fixed `String`/`Boolean`/`Integer`/`Float` attribute types are ordinary
`AttrType` cells, so skipping them keeps `doc.attrTypes` pointing at the live
cells the UI, instance editor, and later scripts already reference:

```js
const attrTypeIds = new Set(schema.cellsOf(AttrType).map((c) => c.id));
for (const c of schema.cells()) {
    if (!attrTypeIds.has(c.id)) c.delete();
}
```

After this, `attrTypes.String` / `attrTypes.Boolean` / `attrTypes.Integer` /
`attrTypes.Float` still point at the surviving attribute-type cells, so
schema-building continues as normal.

### Instance API (`instance`)

```js
// Add rows. Inline args name the entity's outgoing attributes and mappings.
const acme = instance.add(company, {});
const fred = instance.add(person, { name: "Fred", employer: acme });

// List rows.
instance.rows(); // all rows
instance.rowsOf(person); // rows of one entity

// Validate against the schema (async).
const result = await instance.validate();
```

### Row API (a `Row` from `add` / `rows()`)

```js
fred.id; // stable row id (use as a mapping target)
fred.entity; // the schema entity this row is a record of
fred.get(name); // value for a morphism, keyed by its UUID (collision-free)
fred.set(name, "Freddy"); // set an attribute literal, or a mapping's target Row
fred.set(employer, acme); // point a foreign key at another row
fred.set(name, undefined); // clear a value
fred.values; // { [morphismName]: value }  (names may collide; last wins)
fred.valuesById; // { [morphismUUID]: value }  (collision-free)
fred.delete(); // delete this row
```

- A mapping value is the **target `Row`**; an attribute value is a **literal**
  (`string` for `String`, `boolean` for `Boolean`, `number` for `Integer`/`Float`).
- Prefer `get(morphism)` / `valuesById` over `values` when a schema may have
  two morphisms sharing a name.
- Deleting a row leaves foreign keys pointing at it dangling; they show as
  invalid on the next `validate()`.

### Complete example

Build a small schema and populate an instance in one script. Note the reset at
the top — always start from a clean slate unless asked to extend existing state:

```js
// Reset: delete every cell except the two fixed attribute types.
const attrTypeIds = new Set(schema.cellsOf(AttrType).map((c) => c.id));
for (const c of schema.cells()) {
    if (!attrTypeIds.has(c.id)) c.delete();
}

const person = schema.add(Entity, { label: "Person" });
const company = schema.add(Entity, { label: "Company" });
schema.add(Attr, { label: "name", from: person, to: attrTypes.String });
schema.add(Mapping, { label: "employer", from: person, to: company });

const acme = instance.add(company, {});
instance.add(person, { name: "Fred", employer: acme });
instance.add(person, { name: "Wilma", employer: acme });

const result = await instance.validate();
result.tag; // the async function's return value is shown in the status line
```

The script's return value (or a thrown error) is returned by `run_script` and
also displayed under the editor.
