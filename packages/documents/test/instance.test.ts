import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import {
    createBinder,
    Instantiation,
    type Instance,
    type InstanceDocumentHandle,
    type InstanceTable,
    type TableRow,
} from "catcolab-documents";

const binder = createBinder();

const validateInstance = async (handle: InstanceDocumentHandle): Promise<Instance> => {
    const result = await handle.validate();
    if (result.tag !== "Ok") {
        throw new Error("Expected instance validation to succeed");
    }
    return result.content.instance;
};

const tableFor = (tables: InstanceTable[], id: string): InstanceTable => {
    const table = tables.find((candidate) => candidate.id === id);
    if (!table) {
        throw new Error(`Expected table ${id}`);
    }
    return table;
};

const fieldFor = (table: InstanceTable, row: TableRow, id: string) =>
    row.fields[table.headers.findIndex((header) => header.id === id)];

describe("instances", () => {
    test("tables list schema entities and provide live row handles", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const employer = schema.add(Mapping, {
            label: "employer",
            from: person,
            to: company,
        });
        const name = schema.add(Attr, { label: "name", from: person, to: str });

        const instanceHandle = await binder.createInstance(schema, { title: "Company instance" });
        const instance = await validateInstance(instanceHandle);
        const tables = instance.tables;
        const personTable = tableFor(tables, person.id);
        const companyTable = tableFor(tables, company.id);

        expect(tables.map((table) => table.label)).toEqual(["Person", "Company"]);
        expect(personTable.headers.map((header) => header.label)).toEqual(["employer", "name"]);
        expect(personTable.headers.map((header) => header.type)).toEqual([
            { tag: "RowRef", content: { id: company.id } },
            { tag: "String" },
        ]);

        const acme = companyTable.addRow();
        const fred = personTable.addRow();
        fred.set(employer, acme);
        fred.set(name, "Fred");

        expect(personTable.rows).toHaveLength(1);
        expect(companyTable.rows).toHaveLength(1);
        expect(fred.index).toBe(0);
        expect(acme.index).toBe(0);
        expect(fieldFor(personTable, fred, employer.id)).toMatchObject({
            tag: "RowRef",
            content: { id: acme.id },
        });
        expect(fieldFor(personTable, fred, name.id)).toMatchObject({
            tag: "String",
            content: { value: "Fred" },
        });

        fred.set(name, "Frederick");
        fred.set(employer, null);
        expect(fieldFor(personTable, fred, employer.id)).toMatchObject({ tag: "Null" });
        expect(fieldFor(personTable, fred, name.id)).toMatchObject({
            tag: "String",
            content: { value: "Frederick" },
        });
    });

    test("validate returns the schema model and tables", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = schema.add(Entity, { label: "Person" });
        const instanceHandle = await binder.createInstance(schema, { title: "Data" });
        const instance = await validateInstance(instanceHandle);

        tableFor(instance.tables, person.id).addRow();
        const result = await instanceHandle.validate();

        if (result.tag !== "Ok") {
            throw new Error("Expected validation to succeed");
        }
        expect(result.content.instance.title).toBe("Data");
        expect(result.content.instance.tables.map((table) => table.id)).toEqual([person.id]);
        expect(result.content.instance.tables[0]?.rows).toHaveLength(1);
    });

    test("rows and fields expose document paths that instance.get resolves", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = schema.add(Entity, { label: "Person" });
        const str = schema.add(AttrType, { label: "String" });
        const name = schema.add(Attr, { label: "name", from: person, to: str });
        const instanceHandle = await binder.createInstance(schema, { title: "Data" });
        const instance = await validateInstance(instanceHandle);
        const table = tableFor(instance.tables, person.id);
        const row = table.addRow({ name: "Fred" });
        const field = row.fields[0];

        expect(row.id).toBeTypeOf("string");
        expect(field?.content.path).toEqual([person.id, "rows", row.id, "fields", name.id]);
        expect(instance.get([person.id])).toMatchObject({
            tag: "Ok",
            content: { id: person.id },
        });
        expect(instance.get([person.id, "rows", row.id])).toMatchObject({
            tag: "Ok",
            content: { id: row.id },
        });
        expect(instance.get(field!.content.path)).toEqual({ tag: "Ok", content: field });
    });

    test("tables hide a deleted entity but retain its stored rows", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Shrinking schema" });
        const person = schema.add(Entity, { label: "Person" });
        const personId = person.id;
        const instanceHandle = await binder.createInstance(schema, { title: "Data" });
        const instance = await validateInstance(instanceHandle);

        tableFor(instance.tables, personId).addRow();
        schema
            .cellsOf(Entity)
            .find((cell) => cell.id === personId)
            ?.delete();

        expect(instance.tables).toEqual([]);
        expect(Object.keys(instanceHandle.document.tables[personId]?.rows ?? {})).toHaveLength(1);
    });

    test("validated and imported schema objects resolve to tables", async () => {
        const imported = await binder.createNotebook(SimpleSchema, { title: "Imported" });
        const external = imported.add(Entity, { label: "External" });
        const string = imported.add(AttrType, { label: "String" });
        imported.add(Attr, { label: "name", from: external, to: string });

        const schema = await binder.createNotebook(SimpleSchema, { title: "Root" });
        schema.add(Instantiation, { label: "Import", model: imported });
        const validation = await schema.validate();
        if (validation.tag !== "Ok") {
            throw new Error("Expected schema validation to succeed");
        }
        const importedEntity = validation.content
            .judgmentsOf(Entity)
            .find((judgment) => judgment.label === "Import.External");
        const importedAttr = validation.content
            .judgmentsOf(Attr)
            .find((judgment) => judgment.label === "Import.name");
        if (!importedEntity || !importedAttr) {
            throw new Error("Expected imported judgments");
        }

        const instanceHandle = await binder.createInstance(schema, { title: "Root data" });
        const instance = await validateInstance(instanceHandle);
        const importedTable = tableFor(instance.tables, importedEntity.id);
        const row = importedTable.addRow();
        row.set(importedAttr, "Remote");

        expect(importedTable.label).toBe("Import.External");
        expect(importedTable.headers.map((header) => header.label)).toEqual(["Import.name"]);
        expect(row.fields).toMatchObject([{ tag: "String", content: { value: "Remote" } }]);
        expect((await instanceHandle.validate()).tag).toBe("Ok");
    });

    test("loadInstance restores table rows and values", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const str = schema.add(AttrType, { label: "String" });
        const name = schema.add(Attr, { label: "name", from: person, to: str });
        const instanceHandle = await binder.createInstance(schema, { title: "Company instance" });
        const instance = await validateInstance(instanceHandle);
        const row = tableFor(instance.tables, person.id).addRow();
        row.set(name, "Fred");

        const reloadedHandle = await binder.loadInstance(
            schema,
            structuredClone(instanceHandle.document),
        );
        const reloaded = await validateInstance(reloadedHandle);
        const reloadedTable = tableFor(reloaded.tables, person.id);

        expect(reloadedTable.rows).toHaveLength(1);
        expect(fieldFor(reloadedTable, reloadedTable.rows[0]!, name.id)).toMatchObject({
            tag: "String",
            content: { value: "Fred" },
        });
        expect((await reloadedHandle.validate()).tag).toBe("Ok");
    });

    test("deleting a schema morphism hides its column but retains stored data", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const str = schema.add(AttrType, { label: "String" });
        const name = schema.add(Attr, { label: "name", from: person, to: str });
        const attrId = name.id;
        const instanceHandle = await binder.createInstance(schema, { title: "Company instance" });
        const instance = await validateInstance(instanceHandle);
        const table = tableFor(instance.tables, person.id);
        const row = table.addRow();
        row.set(name, "Fred");

        expect(row.fields).toMatchObject([{ tag: "String", content: { value: "Fred" } }]);
        schema
            .cellsOf(Attr)
            .find((cell) => cell.id === attrId)
            ?.delete();

        const refreshedTable = tableFor(instance.tables, person.id);
        expect(refreshedTable.headers).toEqual([]);
        expect(refreshedTable.rows[0]?.fields).toEqual([]);
        const storedRow = Object.values(instanceHandle.document.tables[person.id]?.rows ?? {})[0];
        expect(storedRow?.fields[attrId]).toEqual({ String: "Fred" });
    });
});
