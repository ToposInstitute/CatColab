import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, type InstanceTable, type TableRow } from "catcolab-documents";

const binder = createBinder();

const tableFor = (tables: InstanceTable[], id: string): InstanceTable => {
    const table = tables.find((candidate) => candidate.id === id);
    if (!table) {
        throw new Error(`Expected table ${id}`);
    }
    return table;
};

const cellFor = (table: InstanceTable, row: TableRow, id: string) =>
    row.cells[table.headers.findIndex((header) => header.id === id)];

describe("instance row editing", () => {
    test("addRow sets initial values by column label", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const name = schema.add(Attr, { label: "name", from: person, to: str });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const personTable = tableFor(tables, person.id);
        const acme = tableFor(tables, company.id).addRow();

        const fred = personTable.addRow({ name: "Fred", employer: acme });

        expect(cellFor(personTable, fred, name.id)).toMatchObject({
            tag: "String",
            content: "Fred",
        });
        expect(cellFor(personTable, fred, employer.id)).toMatchObject({
            tag: "RowRef",
            content: { index: 0 },
        });
    });

    test("set replaces and clears row values", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const name = schema.add(Attr, { label: "name", from: person, to: str });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const personTable = tableFor(tables, person.id);
        const acme = tableFor(tables, company.id).addRow();
        const fred = personTable.addRow();

        fred.set(name, "Fred");
        expect(cellFor(personTable, fred, name.id)).toMatchObject({
            tag: "String",
            content: "Fred",
        });
        fred.set(name, "Freddy");
        expect(cellFor(personTable, fred, name.id)).toMatchObject({
            tag: "String",
            content: "Freddy",
        });

        fred.set(employer, acme);
        expect(cellFor(personTable, fred, employer.id)).toMatchObject({
            tag: "RowRef",
            content: { index: 0 },
        });

        fred.set(name, null);
        expect(cellFor(personTable, fred, name.id)).toMatchObject({ tag: "Null" });
        expect((await instance.validate()).tag).toBe("Ok");
    });

    test("morphisms sharing a label remain independent by UUID", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const str = schema.add(AttrType, { label: "String" });
        const alias1 = schema.add(Attr, { label: "alias", from: person, to: str });
        const alias2 = schema.add(Attr, { label: "alias", from: person, to: str });
        const instance = await binder.createInstance(schema, { title: "I" });
        const table = tableFor(instance.tables, person.id);
        const fred = table.addRow();

        fred.set(alias1, "Freddy");
        fred.set(alias2, "Fred the Great");
        expect(cellFor(table, fred, alias1.id)).toMatchObject({
            tag: "String",
            content: "Freddy",
        });
        expect(cellFor(table, fred, alias2.id)).toMatchObject({
            tag: "String",
            content: "Fred the Great",
        });

        fred.set(alias1, null);
        expect(cellFor(table, fred, alias1.id)).toMatchObject({ tag: "Null" });
        expect(cellFor(table, fred, alias2.id)).toMatchObject({
            tag: "String",
            content: "Fred the Great",
        });
    });

    test("update sets and clears values by column label", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const name = schema.add(Attr, { label: "name", from: person, to: str });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const personTable = tableFor(tables, person.id);
        const acme = tableFor(tables, company.id).addRow();
        const fred = personTable.addRow();

        fred.update({ name: "Fred", employer: acme });

        expect(cellFor(personTable, fred, name.id)).toMatchObject({
            tag: "String",
            content: "Fred",
        });
        expect(cellFor(personTable, fred, employer.id)?.tag).toBe("RowRef");

        fred.update({ name: null });

        expect(cellFor(personTable, fred, name.id)).toMatchObject({ tag: "Null" });
        expect(() => fred.update({ missing: "value" })).toThrow("No mapping or attribute");
    });

    test("delete removes a row and leaves references dangling", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const companyTable = tableFor(tables, company.id);
        const personTable = tableFor(tables, person.id);
        const acme = companyTable.addRow();
        const fred = personTable.addRow({ employer: acme });

        acme.delete();

        expect(companyTable.rows).toEqual([]);
        expect(cellFor(personTable, fred, employer.id)?.tag).toBe("DanglingRowRef");
        expect(() => acme.delete()).toThrow("No instance row");
    });

    test("a dangling row reference makes validation return Err", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const companyTable = tableFor(tables, company.id);
        const personTable = tableFor(tables, person.id);
        const acme = companyTable.addRow();
        const fred = personTable.addRow();
        fred.set(employer, acme);
        expect((await instance.validate()).tag).toBe("Ok");

        const storedCompany = instance.document.tables[company.id];
        const acmeId = storedCompany?.row_order[0];
        if (!storedCompany || !acmeId) {
            throw new Error("Expected stored company row");
        }
        delete storedCompany.rows[acmeId];
        storedCompany.row_order.splice(0, 1);

        // The dangling reference surfaces as its own cell variant carrying
        // the stored uuid, not as a row handle.
        expect(cellFor(personTable, fred, employer.id)).toMatchObject({
            tag: "DanglingRowRef",
            content: acmeId,
        });

        const result = await instance.validate();
        if (result.tag !== "Err") {
            throw new Error("Expected validation to fail");
        }
        expect(result.content.issues).not.toEqual([]);
        expect(result.content.instance).not.toBeNull();
        expect(result.content.instance?.tables.map((table) => table.id)).toEqual(
            tables.map((table) => table.id),
        );
        expect(result.content.issues).toContainEqual({
            message: "`employer` refers to a row that no longer exists",
            path: ["tables", person.id, "rows", fred.id, "fields", employer.id],
            issueType: "DanglingRowRef",
        });
    });
});
