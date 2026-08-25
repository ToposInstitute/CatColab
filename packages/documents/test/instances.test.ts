import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import {
    atomicTypeOfAttributeType,
    createBinder,
    defineShape,
    type DocumentRef,
    type DocumentStore,
    type Issue,
    type Result,
    type TableFieldIssue,
} from "catcolab-documents";

function refOf<Handle>(store: DocumentStore<Handle>, handle: Handle): DocumentRef {
    return store.getDocumentRef(handle);
}

function expectOk<T, E>(result: Result<T, E>): T {
    expect(result.tag).toBe("Ok");
    if (result.tag === "Err") {
        throw new Error(`Expected Ok result: ${String(result.content)}`);
    }
    return result.content;
}

function expectErr<T, E>(result: Result<T, E>): E {
    expect(result.tag).toBe("Err");
    if (result.tag === "Ok") {
        throw new Error("Expected Err result");
    }
    return result.content;
}

interface StoredInstanceForTest {
    tables: Record<
        string,
        {
            rows: Record<
                string,
                {
                    fields: Record<
                        string,
                        | "Null"
                        | { Bool: boolean }
                        | { Int: number }
                        | { Float: number }
                        | { String: string }
                        | { RowRef: string }
                    >;
                }
            >;
            rowOrder: string[];
        }
    >;
}

describe("instance document creation", () => {
    test("an instance document is created linked to its schema", { timeout: 20_000 }, async () => {
        const binder = createBinder();

        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        schema.add(Mapping, { label: "employer", from: person, to: company });
        schema.add(Attr, { label: "name", from: person, to: str });

        const instance = expectOk(
            await binder.createInstance(schema, { title: "Company instance" }),
        );

        expect(instance.title).toBe("Company instance");
        expect(instance.shape).toBe(SimpleSchema);
        expect(instance.document.type).toBe("instance");
        expect(instance.document.tables).toEqual({});
        expect(instance.document.instanceOf._id).toBe(refOf(binder.store, schema.handle).id);
        expect(instance.document.instanceOf.type).toBe("instance-of");

        const dumped = instance.dump();
        dumped.name = "Detached";
        expect(instance.title).toBe("Company instance");

        instance.update({ title: "Renamed" });
        expect(instance.title).toBe("Renamed");

        let changes = 0;
        const unsubscribe = instance.onChange(() => {
            changes += 1;
        });
        instance.update({ title: "Again" });
        expect(changes).toBe(1);
        unsubscribe();
        instance.update({ title: "Once more" });
        expect(changes).toBe(1);
    });

    test(
        "an instance of a notebook-defined model uses the meta-model's shape",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();

            const causalLoop = await binder.createNotebook(SimpleSchema, { title: "Causal loop" });
            const string = causalLoop.add(AttrType, { label: "String" });
            const variable = causalLoop.add(Entity, { label: "Variable" });
            causalLoop.add(Attr, { label: "name", from: variable, to: string });
            const positiveLink = causalLoop.add(Entity, { label: "PositiveLink" });
            causalLoop.add(Mapping, { label: "from", from: positiveLink, to: variable });
            causalLoop.add(Mapping, { label: "to", from: positiveLink, to: variable });

            const predatorPrey = expectOk(
                await binder.createInstance(causalLoop, { title: "Predator-prey" }),
            );

            expect(predatorPrey.title).toBe("Predator-prey");
            expect(predatorPrey.shape).toBe(SimpleSchema);
            expect(predatorPrey.document.tables).toEqual({});
            expect(predatorPrey.document.instanceOf._id).toBe(
                refOf(binder.store, causalLoop.handle).id,
            );
        },
    );

    test("creating an instance of a shape without instance support fails at runtime", async () => {
        const binder = createBinder();
        const bare = defineShape({ theory: "bare-theory" });
        const notebook = await binder.createNotebook(bare, { title: "Bare" });

        const issues = expectErr(await binder.createInstance(notebook, { title: "Bare instance" }));
        expect(issues[0]?.message).toMatch(/does not support instances/);
    });

    test("an instance can be loaded from a document reference", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        schema.add(Entity, { label: "Company" });
        const instance = expectOk(
            await binder.createInstance(schema, { title: "Company instance" }),
        );

        const loaded = expectOk(
            await binder.loadInstanceFromRef(schema, refOf(binder.store, instance.handle)),
        );

        expect(loaded.title).toBe("Company instance");
        expect(loaded.shape).toBe(SimpleSchema);
        expect(loaded.handle).toBe(instance.handle);
    });
});

describe("instance schema validation", () => {
    test(
        "creation validates the schema and returns the table API",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, {
                title: "Company schema",
            });
            schema.add(Entity, { label: "Person" });
            schema.add(Entity, { label: "Company" });
            schema.add(AttrType, { label: "String" });
            const instance = expectOk(
                await binder.createInstance(schema, { title: "Company instance" }),
            );

            const tables = expectOk(await instance.tables());
            expect(tables.map((table) => table.label)).toEqual(["Person", "Company"]);
            expect(await instance.validate()).toEqual({ tag: "Ok", content: undefined });
        },
    );

    test("an invalid schema does not create an instance", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Invalid schema" });
        schema.add(Mapping, { label: "invalid", from: null, to: null });

        const issues = expectErr(
            await binder.createInstance(schema, { title: "Company instance" }),
        );
        expect(issues.length).toBeGreaterThan(0);
    });

    test("change and validation subscriptions combine the schema and instance", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        schema.add(Entity, { label: "Person" });
        const instance = expectOk(
            await binder.createInstance(schema, { title: "Company instance" }),
        );

        let changes = 0;
        const unsubscribeChanges = instance.onChange(() => {
            changes += 1;
        });
        const validations: Result<void, ReadonlyArray<Issue | TableFieldIssue>>[] = [];
        const unsubscribeValidation = instance.onValidate((result) => {
            validations.push(result);
        });

        await expect.poll(() => validations.length).toBe(1);
        expectOk(validations[0]!);
        expect(expectOk(await instance.tables()).map((table) => table.label)).toEqual(["Person"]);

        schema.add(Mapping, { label: "invalid", from: null, to: null });
        await expect.poll(() => changes).toBe(1);
        await expect.poll(() => validations.at(-1)?.tag).toBe("Err");

        instance.update({ title: "Renamed instance" });
        await expect.poll(() => changes).toBe(2);
        await expect.poll(() => validations.length).toBeGreaterThanOrEqual(3);
        expect(validations.at(-1)?.tag).toBe("Err");

        unsubscribeChanges();
        unsubscribeValidation();
    });
});

describe("tabular instances", () => {
    test("tables and headers are derived and rows can be edited", { timeout: 20_000 }, async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, {
            title: "Company schema",
        });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        schema.add(Mapping, {
            label: "employer",
            from: person,
            to: company,
        });
        schema.add(Attr, { label: "name", from: person, to: str });
        schema.add(Attr, { label: "companyName", from: company, to: str });
        const instance = expectOk(
            await binder.createInstance(schema, { title: "Company instance" }),
        );

        expect((await instance.validate()).tag).toBe("Ok");
        const tables = expectOk(await instance.tables());
        const personTable = tables.find((table) => table.label === "Person");
        const companyTable = tables.find((table) => table.label === "Company");
        expect(personTable).toBeDefined();
        expect(companyTable).toBeDefined();
        if (personTable === undefined || companyTable === undefined) {
            return;
        }

        expect(personTable.headers.map((header) => header.label)).toEqual(["employer", "name"]);
        const employerHeader = personTable.headers.find((header) => header.label === "employer");
        const nameHeader = personTable.headers.find((header) => header.label === "name");
        const companyNameHeader = companyTable.headers.find(
            (header) => header.label === "companyName",
        );
        expect(employerHeader).toBeDefined();
        expect(nameHeader).toBeDefined();
        expect(companyNameHeader).toBeDefined();
        if (
            employerHeader === undefined ||
            nameHeader === undefined ||
            companyNameHeader === undefined
        ) {
            return;
        }
        expect(employerHeader.type).toEqual({
            tag: "RowRef",
            content: { id: companyTable.id },
        });
        expect(nameHeader.type).toEqual({ tag: "String" });

        expect(await instance.get([personTable.id])).toMatchObject({
            tag: "Ok",
            content: { id: personTable.id },
        });
        const missingIssues = expectErr(await instance.get(["missing-table"]));
        expect(missingIssues[0]?.message).toMatch(/does not exist/);

        const acme = expectOk(await instance.addRow(companyTable, { companyName: "Acme" }));
        const alice = expectOk(
            await instance.addRow(personTable, { name: "Alice", employer: acme }),
        );
        const bob = expectOk(await instance.addRow(personTable, { name: "Bob", employer: acme }));

        expect(personTable.rows.map((row) => row.id)).toEqual([alice.id, bob.id]);
        expect(alice.index).toBe(0);
        expect(alice.fields.map((field) => field.tag)).toEqual(["RowRef", "String"]);

        const nameResult = await instance.get([
            personTable.id,
            "rows",
            alice.id,
            "fields",
            nameHeader.id,
        ]);
        expect(nameResult).toEqual({
            tag: "Ok",
            content: {
                tag: "String",
                content: {
                    path: [personTable.id, "rows", alice.id, "fields", nameHeader.id],
                    value: "Alice",
                },
            },
        });

        expectOk(await instance.set(bob, nameHeader, "Robert"));
        expect(bob.fields.find((field) => field.tag === "String")).toMatchObject({
            content: { value: "Robert" },
        });

        let changes = 0;
        const unsubscribe = instance.onChange(() => {
            changes += 1;
        });
        const [initech, carol, dave] = expectOk(
            await instance.addRows([
                { table: companyTable },
                { table: personTable, values: [{ name: "Carol" }, { name: "Dave" }] },
            ]),
        );
        expect(changes).toBe(1);
        expect(initech).toBeDefined();
        expect(carol).toBeDefined();
        expect(dave).toBeDefined();
        if (initech === undefined || carol === undefined || dave === undefined) {
            return;
        }
        expectOk(
            await instance.updateRows([
                { row: initech, values: [{ companyName: "Initech" }] },
                { row: carol, values: [{ employer: acme }, { name: "Caroline" }] },
                { row: dave, values: [{ name: "David" }] },
            ]),
        );
        expect(changes).toBe(2);
        expectOk(await instance.set(initech, companyNameHeader, "Initech LLC"));
        expectOk(await instance.set(carol, employerHeader, acme));
        expectOk(await instance.set(dave, employerHeader, acme));
        expect(changes).toBe(5);
        instance.deleteRows([
            { tableId: companyTable.id, rowId: initech.id },
            { tableId: personTable.id, rowId: carol.id },
            { tableId: personTable.id, rowId: dave.id },
        ]);
        expect(changes).toBe(6);
        unsubscribe();
    });

    test(
        "mistyped row references and literals report their field paths",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, {
                title: "Company schema",
            });
            const person = schema.add(Entity, { label: "Person" });
            const company = schema.add(Entity, { label: "Company" });
            const string = schema.add(AttrType, { label: "String" });
            schema.add(Mapping, {
                label: "employer",
                from: person,
                to: company,
            });
            schema.add(Attr, { label: "name", from: person, to: string });
            const instance = expectOk(
                await binder.createInstance(schema, { title: "Company instance" }),
            );
            expect((await instance.validate()).tag).toBe("Ok");
            const tables = expectOk(await instance.tables());
            const personTable = tables.find((table) => table.label === "Person");
            const companyTable = tables.find((table) => table.label === "Company");
            if (personTable === undefined || companyTable === undefined) {
                return;
            }
            const employerHeader = personTable.headers.find(
                (header) => header.label === "employer",
            );
            const nameHeader = personTable.headers.find((header) => header.label === "name");
            if (employerHeader === undefined || nameHeader === undefined) {
                return;
            }

            const acme = expectOk(await instance.addRow(companyTable));
            const alice = expectOk(
                await instance.addRow(personTable, { employer: acme, name: "Alice" }),
            );
            const bob = expectOk(await instance.addRow(personTable, { name: "Bob" }));

            binder.store.changeDocument(instance.document as Document, (document) => {
                const stored = document as unknown as StoredInstanceForTest;
                const table = stored.tables[personTable.id];
                if (table === undefined) {
                    throw new Error("Person table is missing from the stored instance");
                }
                const row = table.rows[alice.id];
                if (row === undefined) {
                    throw new Error("Alice row is missing from the stored instance");
                }
                row.fields[employerHeader.id] = { RowRef: bob.id };
                row.fields[nameHeader.id] = { Int: 42 };
            });

            const result = await instance.validate();
            expect(result.tag).toBe("Err");
            if (result.tag !== "Err") {
                return;
            }
            expect(result.content).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        path: [personTable.id, "rows", alice.id, "fields", employerHeader.id],
                        issueType: "MistypedRowRef",
                    }),
                    expect.objectContaining({
                        path: [personTable.id, "rows", alice.id, "fields", nameHeader.id],
                        issueType: "MistypedLiteral",
                    }),
                ]),
            );
        },
    );

    test("rows can be deleted while the schema is invalid", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        schema.add(Entity, { label: "Person" });
        const instance = expectOk(
            await binder.createInstance(schema, { title: "Company instance" }),
        );
        const personTable = expectOk(await instance.tables()).find(
            (table) => table.label === "Person",
        );
        if (personTable === undefined) {
            throw new Error("Person table was not derived");
        }
        const row = expectOk(await instance.addRow(personTable));

        schema.add(Mapping, { label: "invalid", from: null, to: null });
        expect((await instance.validate()).tag).toBe("Err");

        instance.deleteRow(personTable.id, row.id);
        expect(instance.document.tables[personTable.id]?.rows[row.id]).toBeUndefined();
    });

    test(
        "deleting a referenced row reports a dangling field path",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, {
                title: "Company schema",
            });
            const person = schema.add(Entity, { label: "Person" });
            const company = schema.add(Entity, { label: "Company" });
            schema.add(Mapping, {
                label: "employer",
                from: person,
                to: company,
            });
            const instance = expectOk(
                await binder.createInstance(schema, { title: "Company instance" }),
            );
            expect((await instance.validate()).tag).toBe("Ok");
            const tables = expectOk(await instance.tables());
            const personTable = tables.find((table) => table.label === "Person");
            const companyTable = tables.find((table) => table.label === "Company");
            if (personTable === undefined || companyTable === undefined) {
                return;
            }

            const employerHeader = personTable.headers.find(
                (header) => header.label === "employer",
            );
            if (employerHeader === undefined) {
                return;
            }
            const acme = expectOk(await instance.addRow(companyTable));
            const alice = expectOk(await instance.addRow(personTable, { employer: acme }));
            instance.deleteRow(companyTable.id, acme.id);

            const result = await instance.validate();
            expect(result.tag).toBe("Err");
            if (result.tag !== "Err") {
                return;
            }
            expect(result.content).toContainEqual({
                message: "`employer` refers to a row that no longer exists",
                path: [personTable.id, "rows", alice.id, "fields", employerHeader.id],
                issueType: "DanglingRowRef",
            });
        },
    );
});

describe("atomic instance column types", () => {
    test("attribute type labels match exact atomic names", () => {
        expect(atomicTypeOfAttributeType({ label: ["Bool"] })).toBe("Bool");
        expect(atomicTypeOfAttributeType({ label: ["Int"] })).toBe("Int");
        expect(atomicTypeOfAttributeType({ label: ["Float"] })).toBe("Float");
        expect(atomicTypeOfAttributeType({ label: ["String"] })).toBe("String");
        expect(atomicTypeOfAttributeType({ label: ["namespace", "Bool"] })).toBe("String");
        expect(atomicTypeOfAttributeType({ label: undefined })).toBe("String");
        expect(atomicTypeOfAttributeType({ label: ["string"] })).toBe("String");
    });
});
