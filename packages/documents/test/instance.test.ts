import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, Instantiation, isRow } from "catcolab-documents";

const binder = createBinder();

describe("instances", () => {
    test("createInstance inserts rows with mapping and attribute values", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });

        schema.add(Mapping, { label: "employer", from: person, to: company });
        schema.add(Attr, { label: "name", from: person, to: str });

        const instance = await binder.createInstance(schema, { title: "Company instance" });
        const acme = instance.add(company, {});
        const fred = instance.add(person, { name: "Fred", employer: acme });

        expect(instance.theory).toBe("simple-schema");

        // Rows are of their schema entity; value rows (the "Fred" attribute
        // value) are not listed as rows.
        expect(fred.entity?.label).toBe("Person");
        expect(acme.entity?.label).toBe("Company");
        expect(instance.rows().length).toBe(2);
        expect(instance.rowsOf(person).length).toBe(1);
        expect(instance.rowsOf(company).length).toBe(1);

        // A mapping value is the target row; an attribute value is the literal.
        const values = fred.values;
        expect(values["name"]).toBe("Fred");
        expect((values["employer"] as { id: string }).id).toBe(acme.id);

        const result = await instance.validate();
        expect(result.tag).toBe("Valid");
    });

    test("tables() lists a table per live entity, with columns and row handles", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        schema.add(Mapping, { label: "employer", from: person, to: company });
        schema.add(Attr, { label: "name", from: person, to: str });

        const instance = await binder.createInstance(schema, { title: "Company instance" });

        // No prior validate() is needed: tables() resolves the schema itself.
        // Row-less entities get (synthesized) empty tables; the attribute type
        // is not row-bearing, so it gets no table at all.
        const tables = await instance.tables();
        expect(tables.map((table) => table.label)).toEqual(["Person", "Company"]);
        expect(tables.map((table) => table.rows)).toEqual([[], []]);

        // Columns are the schema morphisms out of the table's entity, each
        // pointing at its codomain object.
        const personTable = tables[0];
        const companyTable = tables[1];
        if (!personTable || !companyTable) {
            throw new Error("expected two tables");
        }
        expect(personTable.id).toBe(person.id);
        expect(personTable.columns.map((column) => column.label)).toEqual(["employer", "name"]);
        expect(personTable.columns.map((column) => column.to?.label)).toEqual([
            "Company",
            "String",
        ]);
        expect(companyTable.columns).toEqual([]);

        // Rows are a live view: rows added after tables() resolved appear. A
        // row can be inserted through the table itself, or through the
        // instance — where the table works as the entity ref, since its id is
        // its entity's.
        const acme = companyTable.addRow();
        const fred = instance.addRow(person, { name: "Fred", employer: acme });
        expect(personTable.rows.map((row) => row.id)).toEqual([fred.id]);
        expect(companyTable.rows.map((row) => row.id)).toEqual([acme.id]);

        // The rows are full Row handles: values are read and written through
        // the table, keyed by column, and pattern matched with isRow.
        const [employerColumn, nameColumn] = personTable.columns;
        const row = personTable.rows[0];
        if (!row || !employerColumn || !nameColumn) {
            throw new Error("expected the row and its columns");
        }
        expect(row.get(nameColumn)).toBe("Fred");
        const employerValue = row.get(employerColumn);
        expect(isRow(employerValue)).toBe(true);
        expect(isRow(employerValue) && employerValue.id).toBe(acme.id);
        expect(isRow(row.get(nameColumn))).toBe(false);

        // A row's cells mirror the stored FieldValue shape, positionally
        // aligned with the table's columns, with a mapping's stored row ref
        // resolved into the linked row itself.
        const [employerCell, nameCell] = row.cells;
        if (
            typeof employerCell !== "object" ||
            !("Row" in employerCell) ||
            typeof nameCell !== "object" ||
            !("String" in nameCell)
        ) {
            throw new Error("expected a linked-row and a String cell");
        }
        expect(employerCell.Row.id).toBe(acme.id);
        expect(nameCell.String).toBe("Fred");
        // The linked row is a live handle: it reads through to its own table.
        expect(employerCell.Row.entity.label).toBe("Company");
        expect(employerCell.Row.index).toBe(0);

        // Rows know their position in their table's row order.
        expect(fred.index).toBe(0);
        expect(acme.index).toBe(0);
        const wilma = instance.add(person);
        expect(wilma.index).toBe(1);
        wilma.delete();
        expect(wilma.index).toBe(-1);

        // Cells are a live view too: a write shows up, and an unset column is
        // an explicit "Null" cell so the row always spans the whole grid.
        row.set(nameColumn, "Frederick");
        expect(row.cells[1]).toEqual({ String: "Frederick" });
        row.set(employerColumn, undefined);
        expect(row.cells[0]).toBe("Null");
        expect(acme.cells).toEqual([]);
    });

    test("tables() hides a deleted entity's table but retains its data", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Shrinking schema" });
        const person = schema.add(Entity, { label: "Person" });
        const personId = person.id;

        const instance = await binder.createInstance(schema, { title: "Data" });
        instance.add(person);
        expect((await instance.tables()).map((table) => table.id)).toEqual([personId]);

        schema
            .cellsOf(Entity)
            .find((cell) => cell.id === personId)
            ?.delete();

        // The table is hidden, not lost: the rows stay in the document.
        expect(await instance.tables()).toEqual([]);
        expect(Object.keys(instance.document.tables[personId]?.rows ?? {})).toHaveLength(1);
    });

    test("validated object judgments can identify rows", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const string = schema.add(AttrType, { label: "String" });
        const validation = await schema.validate();
        if (validation.tag !== "Ok") {
            throw new Error("expected the schema to validate");
        }
        const validatedPerson = validation.content.get(Entity, person.id);
        if (validatedPerson.tag !== "Ok") {
            throw new Error("expected the person judgment");
        }

        const instance = await binder.createInstance(schema, { title: "Company instance" });
        instance.add(validatedPerson.content);

        expect(instance.modelNotebook.shape).toBe(SimpleSchema);
        expect(instance.rowsOf(validatedPerson.content)).toHaveLength(1);
        expect(() => instance.add(string)).toThrow("does not support instance rows");
        expect(() => instance.add({ id: "not-in-the-model" })).toThrow("known model object");
        expect(instance.rows()).toHaveLength(1);
    });

    test("stores and validates rows over imported model judgments", async () => {
        const imported = await binder.createNotebook(SimpleSchema, { title: "Imported" });
        const external = imported.add(Entity, { label: "External" });
        const string = imported.add(AttrType, { label: "String" });
        imported.add(Attr, { label: "name", from: external, to: string });

        const schema = await binder.createNotebook(SimpleSchema, { title: "Root" });
        schema.add(Instantiation, { label: "Import", model: imported });
        const validation = await schema.validate();
        if (validation.tag !== "Ok") {
            throw new Error("expected the schema to validate");
        }
        const importedEntity = validation.content
            .judgmentsOf(Entity)
            .find((judgment) => judgment.label === "Import.External");
        const importedAttr = validation.content
            .judgmentsOf(Attr)
            .find((judgment) => judgment.label === "Import.name");
        if (!importedEntity || !importedAttr) {
            throw new Error("expected imported judgments");
        }

        const instance = await binder.createInstance(schema, { title: "Root data" });
        const row = instance.add(importedEntity, { name: "Remote" });

        expect(instance.document.tables[importedEntity.id]?.id).toBe(importedEntity.id);
        expect(row.get(importedAttr)).toBe("Remote");

        // tables() covers imported entities and their (imported) columns.
        const importedTable = (await instance.tables()).find(
            (table) => table.id === importedEntity.id,
        );
        expect(importedTable?.label).toBe("Import.External");
        expect(importedTable?.columns.map((column) => column.label)).toEqual(["Import.name"]);
        expect(importedTable?.rows[0]?.get(importedAttr)).toBe("Remote");
        expect(importedTable?.rows[0]?.cells).toEqual([{ String: "Remote" }]);

        expect((await instance.validate()).tag).toBe("Valid");

        const reloaded = await binder.loadInstance(schema, instance.dump());
        expect(reloaded.rowsOf(importedEntity)).toHaveLength(1);
        expect(reloaded.rowsOf(importedEntity)[0]?.get(importedAttr)).toBe("Remote");
        expect((await reloaded.validate()).tag).toBe("Valid");
    });

    test("loadInstance restores a dumped instance over a reloaded schema", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        schema.add(Mapping, { label: "employer", from: person, to: company });
        schema.add(Attr, { label: "name", from: person, to: str });

        const instance = await binder.createInstance(schema, { title: "Company instance" });
        const acme = instance.add(company, {});
        instance.add(person, { name: "Fred", employer: acme });

        // Persist both documents (as the demo does through localStorage) and
        // rebuild them from those detached dumps.
        const schemaDump = JSON.parse(JSON.stringify(schema.dump()));
        const instanceDump = JSON.parse(JSON.stringify(instance.dump()));

        const loadedSchema = await binder.loadNotebook(SimpleSchema, schemaDump);
        if (loadedSchema.tag !== "Ok") {
            throw new Error("schema failed to reload");
        }
        const reloaded = await binder.loadInstance(loadedSchema.content, instanceDump);

        const reloadedPerson = loadedSchema.content
            .cellsOf(Entity)
            .find((c) => c.label === "Person");
        const reloadedCompany = loadedSchema.content
            .cellsOf(Entity)
            .find((c) => c.label === "Company");
        if (!reloadedPerson || !reloadedCompany) {
            throw new Error("reloaded schema missing entities");
        }

        expect(reloaded.rows().length).toBe(2);
        expect(reloaded.rowsOf(reloadedPerson).length).toBe(1);
        expect(reloaded.rowsOf(reloadedCompany).length).toBe(1);

        const fredRow = reloaded.rowsOf(reloadedPerson)[0];
        expect(fredRow?.values["name"]).toBe("Fred");

        // The reloaded instance still validates against its reloaded schema.
        const result = await reloaded.validate();
        expect(result.tag).toBe("Valid");
    });

    test("scalar cell values retain their tags and JavaScript types", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Metrics schema" });
        const metric = schema.add(Entity, { label: "Metric" });
        const scalar = schema.add(AttrType, { label: "Scalar" });
        const enabled = schema.add(Attr, { label: "enabled", from: metric, to: scalar });
        const count = schema.add(Attr, { label: "count", from: metric, to: scalar });
        const ratio = schema.add(Attr, { label: "ratio", from: metric, to: scalar });

        const instance = await binder.createInstance(schema, { title: "Metrics" });
        const row = instance.add(metric, { enabled: true, count: 3, ratio: 1.1 });

        expect(row.get(enabled)).toBe(true);
        expect(row.get(count)).toBe(3);
        expect(row.get(ratio)).toBe(Math.fround(1.1));

        const stored = instance.document.tables[metric.id]?.rows[row.id]?.fields;
        expect(stored?.[enabled.id]).toEqual({ Bool: true });
        expect(stored?.[count.id]).toEqual({ Int: 3 });
        expect(stored?.[ratio.id]).toEqual({ Float: Math.fround(1.1) });

        // The row's cells expose the same tagged variants as the stored data.
        expect(row.cells).toEqual([{ Bool: true }, { Int: 3 }, { Float: Math.fround(1.1) }]);

        const loaded = await binder.loadInstance(
            schema,
            JSON.parse(JSON.stringify(instance.dump())),
        );
        const loadedRow = loaded.rowsOf(metric)[0];
        expect(loadedRow?.get(enabled)).toBe(true);
        expect(loadedRow?.get(count)).toBe(3);
        expect(loadedRow?.get(ratio)).toBe(Math.fround(1.1));

        expect(() => row.set(ratio, Number.POSITIVE_INFINITY)).toThrow(
            "Instance cell numbers must be finite.",
        );
    });

    test("deleting a schema morphism hides its column but retains the data", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const str = schema.add(AttrType, { label: "String" });
        const nameAttr = schema.add(Attr, { label: "name", from: person, to: str });

        const instance = await binder.createInstance(schema, { title: "Company instance" });
        const fred = instance.add(person, { name: "Fred" });
        expect(fred.values["name"]).toBe("Fred");

        // Capture the generators' UUIDs now: a cell handle's `id` reads through
        // to the live model, so it goes `undefined` once the cell is deleted.
        const attrId = nameAttr.id;
        const personId = person.id;
        const strId = str.id;
        const fredId = fred.id;

        // The attribute is stored in the instance document as a cell value in
        // Fred's table row, keyed by the schema morphism's generator UUID.
        const findStored = () => {
            for (const table of Object.values(instance.document.tables)) {
                const row = table.rows[fredId];
                if (row) {
                    return { entity: table.id, value: row.fields[attrId] };
                }
            }
            return undefined;
        };
        const stored = structuredClone(findStored());
        expect(stored?.value).toEqual({ String: "Fred" });
        // The row's membership is its table: the table names, by UUID, the
        // schema object the row is a record of.
        expect(stored?.entity).toBe(personId);

        // Delete the schema morphism. The morphism generator is gone, so the
        // column is no longer displayed: `values` omits it.
        const attrCell = schema.cellsOf(Attr).find((c) => c.id === attrId);
        attrCell?.delete();
        expect(schema.cellsOf(Attr).length).toBe(0);
        expect(fred.values["name"]).toBeUndefined();

        // But the value itself is untouched in the instance document: it was
        // hidden, not lost. It is identified by the morphism's UUID, which can
        // never be confused with any other generator.
        expect(findStored()).toEqual(stored);

        // Restoring the morphism generator (as undo/redo/rollback would, keeping
        // the same UUID) automatically re-associates the retained data — no
        // diffing of elaborated models is required.
        schema.document.notebook.cellContents[attrId] = {
            tag: "formal",
            id: attrId,
            content: {
                tag: "morphism",
                id: attrId,
                name: "name",
                morType: { tag: "Basic", content: "Attr" },
                dom: { tag: "Basic", content: personId },
                cod: { tag: "Basic", content: strId },
            },
        };
        schema.document.notebook.cellOrder.push(attrId);
        expect(fred.values["name"]).toBe("Fred");
    });
});
