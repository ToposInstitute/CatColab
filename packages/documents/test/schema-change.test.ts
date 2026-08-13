import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import type { Document, ModelJudgment, MorType } from "catcolab-document-types";
import {
    createBinder,
    isCellValid,
    plainStore,
    type InstanceTable,
    type ModelDocument,
    type TableRow,
} from "catcolab-documents";

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

/** The stored morphism judgment of a schema notebook document. */
const morphismDecl = (document: ModelDocument, id: string): ModelJudgment & { tag: "morphism" } => {
    for (const cell of Object.values(document.notebook.cellContents)) {
        const judgment = cell?.tag === "formal" ? (cell.content as ModelJudgment) : undefined;
        if (judgment?.tag === "morphism" && judgment.id === id) {
            return judgment;
        }
    }
    throw new Error(`Expected a stored morphism judgment ${id}`);
};

/**
 * Rewrite a schema morphism in place — same generator id, new kind and
 * codomain — as a document-level schema edit or migration would. Routed
 * through the store so validation sees the change.
 */
const rewriteMorphism = (
    schema: { readonly handle: Document },
    id: string,
    morType: MorType,
    codId: string,
): void => {
    plainStore.changeDocument(schema.handle, (document) => {
        const decl = morphismDecl(document as ModelDocument, id);
        decl.morType = structuredClone(morType);
        decl.cod = { tag: "Basic", content: codId };
    });
};

describe("schema changes under stored instance data", () => {
    test("an unresolved codomain hides its header until restored", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const str = schema.add(AttrType, { label: "String" });
        const name = schema.add(Attr, { label: "name", from: person, to: str });
        const instance = await binder.createInstance(schema, { title: "I" });
        const table = tableFor(instance.tables, person.id);
        const row = table.addRow({ name: "Fred" });
        const schemaDocument = schema.document as ModelDocument;
        const entry = Object.entries(schemaDocument.notebook.cellContents).find(([, cell]) => {
            const judgment = cell?.tag === "formal" ? (cell.content as ModelJudgment) : undefined;
            return judgment?.tag === "object" && judgment.id === str.id;
        });
        if (!entry) {
            throw new Error("Expected the attribute type's stored schema cell");
        }
        const [cellId, storedCell] = entry;
        const orderIndex = schemaDocument.notebook.cellOrder.indexOf(cellId);

        str.delete();

        expect(table.headers).toEqual([]);
        expect(row.cells).toEqual([]);
        const storedRow = Object.values(instance.document.tables[person.id]?.rows ?? {})[0];
        expect(storedRow?.fields[name.id]).toEqual({ String: "Fred" });

        plainStore.changeDocument(schema.handle, (document) => {
            const model = document as ModelDocument;
            model.notebook.cellContents[cellId] = structuredClone(storedCell);
            model.notebook.cellOrder.splice(orderIndex, 0, cellId);
        });

        expect(table.headers.map((header) => header.id)).toEqual([name.id]);
        expect(row.fields).toMatchObject([{ tag: "String", content: "Fred" }]);
    });

    test("a mapping retargeted to another entity mistypes existing links", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const department = schema.add(Entity, { label: "Department" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const personTable = tableFor(tables, person.id);
        const acme = tableFor(tables, company.id).addRow();
        const fred = personTable.addRow();
        fred.set(employer, acme);
        expect((await instance.validate()).tag).toBe("Ok");

        employer.update({ to: department });

        const result = await instance.validate();
        expect(result.tag).toBe("Err");
        if (result.tag !== "Err") {
            throw new Error("Expected validation to fail");
        }
        expect(result.content.issues).toContainEqual({
            message: '`employer` must be a row of table "Department" (was a row of table "Company")',
            path: ["tables", person.id, "rows", fred.id, "fields", employer.id],
            issueType: "MistypedRowRef",
        });
        const cell = cellFor(personTable, fred, employer.id);
        expect(cell).toMatchObject({ tag: "MistypedRowRef", content: { index: 0 } });
        expect(cell && isCellValid(cell)).toBe(false);
    });

    test("a row link under a header turned attribute is mistyped", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const personTable = tableFor(tables, person.id);
        const acme = tableFor(tables, company.id).addRow();
        const fred = personTable.addRow();
        fred.set(employer, acme);
        expect((await instance.validate()).tag).toBe("Ok");

        rewriteMorphism(schema, employer.id, Attr.morType, str.id);

        const result = await instance.validate();
        expect(result.tag).toBe("Err");
        expect(cellFor(personTable, fred, employer.id)).toMatchObject({
            tag: "MistypedRowRef",
            content: { index: 0 },
        });
    });

    test("a literal under a header turned mapping is mistyped and flagged", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const nickname = schema.add(Attr, { label: "nickname", from: person, to: str });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const personTable = tableFor(tables, person.id);
        const fred = personTable.addRow();
        fred.set(nickname, "Fred");
        expect((await instance.validate()).tag).toBe("Ok");

        // The stored literal no longer fits under a mapping and validation
        // must not fabricate a phantom row for it.
        rewriteMorphism(schema, nickname.id, Mapping.morType, company.id);

        const result = await instance.validate();
        expect(result.tag).toBe("Err");
        expect(cellFor(personTable, fred, nickname.id)).toMatchObject({
            tag: "MistypedLiteral",
            content: { tag: "String", content: "Fred" },
        });
    });

    test("a deleted target row wins over a mistyped header", async () => {
        const schema = await binder.createNotebook(SimpleSchema, { title: "S" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        const employer = schema.add(Mapping, { label: "employer", from: person, to: company });
        const instance = await binder.createInstance(schema, { title: "I" });
        const tables = instance.tables;
        const personTable = tableFor(tables, person.id);
        const acme = tableFor(tables, company.id).addRow();
        const fred = personTable.addRow();
        fred.set(employer, acme);

        rewriteMorphism(schema, employer.id, Attr.morType, str.id);
        const storedCompany = instance.document.tables[company.id];
        const acmeId = storedCompany?.row_order[0];
        if (!storedCompany || !acmeId) {
            throw new Error("Expected stored company row");
        }
        delete storedCompany.rows[acmeId];
        storedCompany.row_order.splice(0, 1);

        expect((await instance.validate()).tag).toBe("Err");
        expect(cellFor(personTable, fred, employer.id)).toMatchObject({
            tag: "DanglingRowRef",
            content: acmeId,
        });
    });
});
