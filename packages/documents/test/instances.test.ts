import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, type InstanceTable, type TableRow } from "catcolab-documents";

const tableFor = (tables: InstanceTable[], id: string): InstanceTable => {
    const table = tables.find((candidate) => candidate.id === id);
    if (!table) {
        throw new Error(`Expected table ${id}`);
    }
    return table;
};

const stringCell = (table: InstanceTable, row: TableRow, id: string): string | null | undefined => {
    const cell = row.cells[table.headers.findIndex((header) => header.id === id)];
    return cell?.tag === "String" ? cell.content : undefined;
};

describe("tabular instances", () => {
    test("table handles add and enumerate rows", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const name = schema.add(Attr, { label: "name", from: person, to: str });
        const instance = await binder.createInstance(schema, { title: "Company instance" });
        const tables = instance.tables;
        const people = tableFor(tables, person.id);
        const acme = tableFor(tables, company.id).addRow();

        for (const label of ["Alice", "Bob"]) {
            const row = people.addRow();
            row.set(name, label);
            row.set(employer, acme);
        }

        expect(people.rows.map((row) => stringCell(people, row, name.id))).toEqual([
            "Alice",
            "Bob",
        ]);
    });

    test("schema-defined logic produces one table per entity type", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Causal loop" });
        const string = schema.add(AttrType, { label: "String" });
        const variable = schema.add(Entity, { label: "Variable" });
        const name = schema.add(Attr, { label: "name", from: variable, to: string });
        const positive = schema.add(Entity, { label: "PositiveLink" });
        const positiveFrom = schema.add(Mapping, { label: "from", from: positive, to: variable });
        const positiveTo = schema.add(Mapping, { label: "to", from: positive, to: variable });
        const negative = schema.add(Entity, { label: "NegativeLink" });
        const negativeFrom = schema.add(Mapping, { label: "from", from: negative, to: variable });
        const negativeTo = schema.add(Mapping, { label: "to", from: negative, to: variable });
        const instance = await binder.createInstance(schema, { title: "Predator-prey" });
        const tables = instance.tables;
        const variables = tableFor(tables, variable.id);
        const foxes = variables.addRow();
        foxes.set(name, "Foxes");
        const rabbits = variables.addRow();
        rabbits.set(name, "Rabbits");

        const positiveRow = tableFor(tables, positive.id).addRow();
        positiveRow.set(positiveFrom, rabbits);
        positiveRow.set(positiveTo, foxes);
        const negativeRow = tableFor(tables, negative.id).addRow();
        negativeRow.set(negativeFrom, foxes);
        negativeRow.set(negativeTo, rabbits);

        expect(variables.rows.map((row) => stringCell(variables, row, name.id))).toEqual([
            "Foxes",
            "Rabbits",
        ]);
        expect(tableFor(tables, positive.id).rows).toHaveLength(1);
        expect(tableFor(tables, negative.id).rows).toHaveLength(1);
        expect((await instance.validate()).tag).toBe("Ok");
    });
});
