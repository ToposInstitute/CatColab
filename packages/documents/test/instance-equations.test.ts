import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import {
    createBinder,
    PathEquation,
    type EquationViolationIssue,
    type ModelDocument,
    type Notebook,
    type Result,
    type Shape,
    type TableIssue,
} from "catcolab-documents";

function expectOk<T, E>(result: Result<T, E>): T {
    expect(result.tag).toBe("Ok");
    if (result.tag === "Err") {
        throw new Error(`Expected Ok result: ${String(result.content)}`);
    }
    return result.content;
}

function equationViolations(issues: ReadonlyArray<TableIssue>): EquationViolationIssue[] {
    return issues.filter(
        (issue): issue is EquationViolationIssue => issue.issueType === "EquationViolation",
    );
}

function equationDeclId<S extends Shape>(notebook: Notebook<S, ModelDocument>, cellId: string) {
    const cell = notebook.document.notebook.cellContents[cellId];
    if (cell?.tag !== "formal" || cell.content.tag !== "equation") {
        throw new Error("Expected an equation cell.");
    }
    return cell.content.id;
}

describe("instance validation of path equations", { timeout: 30000 }, () => {
    test("a row violating a schema equation is reported as a counterexample", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const a = schema.add(Entity, { label: "A" });
        const b = schema.add(Entity, { label: "B" });
        const f = schema.add(Mapping, { label: "f", from: a, to: b });
        const g = schema.add(Mapping, { label: "g", from: a, to: b });
        const equation = schema.add(PathEquation, { label: "agree", lhs: [f], rhs: [g] });
        const equationId = equationDeclId(schema, equation.id);

        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));
        const validation = await instance.validate();
        expect(validation.modelValidation.issues).toEqual([]);
        expect(validation.issues).toEqual([]);

        const tableA = validation.tables.find((table) => table.label === "A");
        const tableB = validation.tables.find((table) => table.label === "B");
        if (tableA === undefined || tableB === undefined) {
            throw new Error("Expected tables for both entities.");
        }
        const b1 = expectOk(await instance.addRow(tableB));
        const b2 = expectOk(await instance.addRow(tableB));
        const a1 = expectOk(await instance.addRow(tableA, { f: b1, g: b2 }));

        const revalidation = await instance.validate();
        const violations = equationViolations(revalidation.issues);
        expect(violations).toEqual([
            {
                message:
                    "Equation `agree` is violated by a row of table `A`: left-hand side yields " +
                    `row \`${b1.id}\` of table \`B\`, right-hand side yields row \`${b2.id}\` of table \`B\``,
                path: [tableA.id, "rows", a1.id],
                issueType: "EquationViolation",
                equationId,
            },
        ]);

        // Repairing the row by making both sides agree resolves the issue.
        const gHeader = tableA.headers.find((header) => header.label === "g");
        if (gHeader === undefined) {
            throw new Error("Expected a header for the morphism.");
        }
        expectOk(await instance.set(a1, gHeader, b1));
        expect(equationViolations((await instance.validate()).issues)).toEqual([]);
    });

    test("an equation with an identity side can hold", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleOlog, { title: "Schema" });
        const a = schema.add(Type, { label: "A" });
        const f = schema.add(Aspect, { label: "loop", from: a, to: a });
        schema.add(PathEquation, { label: "identity", lhs: [f], rhs: a });

        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));
        const validation = await instance.validate();
        const tableA = validation.tables.find((table) => table.label === "A");
        if (tableA === undefined) {
            throw new Error("Expected a table for the type.");
        }
        const r1 = expectOk(await instance.addRow(tableA));
        const r2 = expectOk(await instance.addRow(tableA));
        const loopHeader = tableA.headers.find((header) => header.label === "loop");
        if (loopHeader === undefined) {
            throw new Error("Expected a header for the aspect.");
        }

        expectOk(await instance.set(r1, loopHeader, r2));
        const violations = equationViolations((await instance.validate()).issues);
        expect(violations.length).toBe(1);
        expect(violations[0]?.path).toEqual([tableA.id, "rows", r1.id]);
        expect(violations[0]?.message).toContain("left-hand side yields");
        expect(violations[0]?.message).toContain(`row \`${r2.id}\``);
        expect(violations[0]?.message).toContain(`row \`${r1.id}\``);

        expectOk(await instance.set(r1, loopHeader, r1));
        expect(equationViolations((await instance.validate()).issues)).toEqual([]);
    });

    test("an equation between attributes compares literal values", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = schema.add(Entity, { label: "Person" });
        const string = schema.add(AttrType, { label: "String" });
        const first = schema.add(Attr, { label: "first", from: person, to: string });
        const second = schema.add(Attr, { label: "second", from: person, to: string });
        schema.add(PathEquation, { label: "agreement", lhs: [first], rhs: [second] });

        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));
        const personTable = (await instance.validate()).tables.find(
            (table) => table.label === "Person",
        );
        if (personTable === undefined) {
            throw new Error("Expected a table for the entity.");
        }
        const secondHeader = personTable.headers.find((header) => header.label === "second");
        if (secondHeader === undefined) {
            throw new Error("Expected a header for the attribute.");
        }

        const alice = expectOk(
            await instance.addRow(personTable, { first: "Alice", second: "Bob" }),
        );
        const violations = equationViolations((await instance.validate()).issues);
        expect(violations.length).toBe(1);
        expect(violations[0]?.path).toEqual([personTable.id, "rows", alice.id]);
        expect(violations[0]?.message).toContain(`left-hand side yields "Alice"`);
        expect(violations[0]?.message).toContain(`right-hand side yields "Bob"`);

        expectOk(await instance.set(alice, secondHeader, "Alice"));
        expect(equationViolations((await instance.validate()).issues)).toEqual([]);
    });

    test("a row where an equation cannot be evaluated is not a counterexample", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const a = schema.add(Entity, { label: "A" });
        const b = schema.add(Entity, { label: "B" });
        const f = schema.add(Mapping, { label: "f", from: a, to: b });
        const g = schema.add(Mapping, { label: "g", from: a, to: b });
        schema.add(PathEquation, { label: "agree", lhs: [f], rhs: [g] });

        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));
        const validation = await instance.validate();
        const tableA = validation.tables.find((table) => table.label === "A");
        const tableB = validation.tables.find((table) => table.label === "B");
        if (tableA === undefined || tableB === undefined) {
            throw new Error("Expected tables for both entities.");
        }
        const b1 = expectOk(await instance.addRow(tableB));
        expectOk(await instance.addRow(tableA, { f: b1 }));

        // The missing `g` value is reported, but yields no equation violation.
        const revalidation = await instance.validate();
        expect(revalidation.issues.some((issue) => issue.issueType === "MissingValue")).toBe(true);
        expect(equationViolations(revalidation.issues)).toEqual([]);
    });

    test("an equation whose source is not a table is not checked", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = schema.add(Entity, { label: "Person" });
        const string = schema.add(AttrType, { label: "String" });
        schema.add(Attr, { label: "name", from: person, to: string });
        schema.add(PathEquation, { label: "trivial", lhs: string, rhs: string });

        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));
        const validation = await instance.validate();
        expect(validation.modelValidation.issues).toEqual([]);

        // The equation elaborates, but its source is an attribute type, which is
        // not a table, so there is nothing to check.
        const equations = validation.modelValidation.model.judgmentsOf(PathEquation);
        expect(equations.length).toBe(1);
        const personTable = validation.tables.find((table) => table.label === "Person");
        if (personTable === undefined) {
            throw new Error("Expected a table for the entity.");
        }
        expectOk(await instance.addRow(personTable, { name: "Alice" }));
        expect(equationViolations((await instance.validate()).issues)).toEqual([]);
    });

    test("violations beyond the counterexample cap are summarized", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const a = schema.add(Entity, { label: "A" });
        const b = schema.add(Entity, { label: "B" });
        const f = schema.add(Mapping, { label: "f", from: a, to: b });
        const g = schema.add(Mapping, { label: "g", from: a, to: b });
        schema.add(PathEquation, { label: "agree", lhs: [f], rhs: [g] });

        const instance = expectOk(await binder.createInstance(schema, { title: "Instance" }));
        const validation = await instance.validate();
        const tableA = validation.tables.find((table) => table.label === "A");
        const tableB = validation.tables.find((table) => table.label === "B");
        if (tableA === undefined || tableB === undefined) {
            throw new Error("Expected tables for both entities.");
        }
        const b1 = expectOk(await instance.addRow(tableB));
        const b2 = expectOk(await instance.addRow(tableB));
        expectOk(
            await instance.addRows([
                { table: tableA, values: Array.from({ length: 12 }, () => ({ f: b1, g: b2 })) },
            ]),
        );

        const revalidation = await instance.validate();
        const violations = equationViolations(revalidation.issues);
        const counterexamples = violations.filter((issue) => issue.path.length === 3);
        const summaries = violations.filter((issue) => issue.path.length === 1);
        expect(counterexamples.length).toBe(10);
        expect(summaries).toEqual([
            expect.objectContaining({
                message: "Equation `agree` is violated by 2 more rows of table `A`",
                path: [tableA.id],
                issueType: "EquationViolation",
            }),
        ]);
    });
});
