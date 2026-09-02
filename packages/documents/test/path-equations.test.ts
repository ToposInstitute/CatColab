import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, defineShape, type EquationSide, PathEquation } from "catcolab-documents";

const WithoutEquations = defineShape({
    theory: "simple-olog-without-equations",
    getCoreTheory: SimpleOlog.getCoreTheory,
    objects: [Type],
    morphisms: [Aspect],
});

function compositeLabels(side: EquationSide<typeof SimpleOlog>): Array<string | undefined> {
    if (!Array.isArray(side)) {
        throw new Error("Expected a composite of morphisms.");
    }
    return side.map((mor) => mor?.label);
}

// The first test run pays the cost of loading the catlog-wasm bundle, so these
// tests have a longer timeout (as in validation.test.ts).
describe("path equations", { timeout: 30000 }, () => {
    test("a path equation cell relates two paths of morphisms", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const person = notebook.add(Entity, { label: "Person" });
        const department = notebook.add(Entity, { label: "Department" });
        const company = notebook.add(Entity, { label: "Company" });

        const worksIn = notebook.add(Mapping, { label: "works in", from: person, to: department });
        const partOf = notebook.add(Mapping, { label: "part of", from: department, to: company });
        const employer = notebook.add(Mapping, { label: "employer", from: person, to: company });

        // An employee's employer is the company their department is part of.
        const equation = notebook.add(PathEquation, {
            label: "employment",
            lhs: [worksIn, partOf],
            rhs: [employer],
        });

        expect(equation.label).toBe("employment");
        const lhs = equation.lhs;
        if (!Array.isArray(lhs)) {
            throw new Error("Expected the left-hand side to be a composite.");
        }
        const rhs = equation.rhs;
        if (!Array.isArray(rhs)) {
            throw new Error("Expected the right-hand side to be a composite.");
        }
        expect(lhs.map((mor) => mor?.label).join(" ; ")).toBe("works in ; part of");
        expect(rhs.map((mor) => mor?.label).join(" ; ")).toBe("employer");
        expect(notebook.cellsOf(PathEquation).length).toBe(1);

        expect((await notebook.validate()).issues).toEqual([]);
    });

    test("equations start as drafts and fail validation until completed", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });
        const g = notebook.add(Aspect, { label: "g", from: a, to: a });

        const equation = notebook.add(PathEquation, { label: "idempotent" });
        expect(equation.label).toBe("idempotent");
        expect(equation.lhs).toEqual([]);
        expect(equation.rhs).toEqual([]);

        const draft = await notebook.validate();
        expect(draft.issues[0]?.message).toContain("missing a side");

        equation.update({ lhs: [f, f], rhs: [g] });
        expect(compositeLabels(equation.lhs)).toEqual(["f", "f"]);
        expect(compositeLabels(equation.rhs)).toEqual(["g"]);

        expect((await notebook.validate()).issues).toEqual([]);
    });

    test("updating a side with an empty composite reverts it to a draft", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });
        const g = notebook.add(Aspect, { label: "g", from: a, to: a });

        const equation = notebook.add(PathEquation, { label: "eq", lhs: [f], rhs: [g] });
        equation.update({ lhs: [] });
        expect(equation.lhs).toEqual([]);

        const result = await notebook.validate();
        expect(result.issues.length).toBeGreaterThan(0);
    });

    test("an equation side may be the identity on an object", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });

        const equation = notebook.add(PathEquation, { label: "inverse", lhs: [f], rhs: a });
        expect(compositeLabels(equation.lhs)).toEqual(["f"]);
        const rhs = equation.rhs;
        if (!("kind" in rhs)) {
            throw new Error("Expected the right-hand side to be an identity.");
        }
        expect(rhs.kind).toBe("object");
        expect(rhs.label).toBe("A");

        expect((await notebook.validate()).issues).toEqual([]);
    });

    test("a deleted morphism reads as a null entry", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });
        const h = notebook.add(Aspect, { label: "h", from: a, to: a });

        const equation = notebook.add(PathEquation, { label: "eq", lhs: [h], rhs: [f] });
        h.delete();
        expect(compositeLabels(equation.lhs)).toEqual([undefined]);

        equation.update({ lhs: [null, f] });
        expect(compositeLabels(equation.lhs)).toEqual(["f"]);
    });

    test("cells enumerate equation cells; shapes without support reject them", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });
        notebook.add(PathEquation, { label: "eq", lhs: [f], rhs: [f] });

        expect(notebook.supports(PathEquation)).toBe(true);
        expect(notebook.cellsOf(PathEquation).length).toBe(1);
        expect(notebook.cells().filter((cell) => cell.kind === "path-equation").length).toBe(1);

        const restricted = await binder.createNotebook(WithoutEquations, {
            title: "No equations",
        });
        const b = restricted.add(Type, { label: "B" });
        const g = restricted.add(Aspect, { label: "g", from: b, to: b });
        expect(restricted.supports(PathEquation)).toBe(false);
        expect(() => restricted.add(PathEquation, { label: "eq", lhs: [g], rhs: [g] })).toThrow(
            "does not support path equations",
        );
    });

    test("an equation whose sides disagree fails validation", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const b = notebook.add(Type, { label: "B" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });
        const g = notebook.add(Aspect, { label: "g", from: b, to: b });
        notebook.add(PathEquation, { label: "bad", lhs: [f], rhs: [g] });

        const result = await notebook.validate();
        expect(result.issues[0]?.message).toContain("sources of the sides don't coincide");
    });

    test("validated models expose equation judgments", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });
        const equation = notebook.add(PathEquation, { label: "inverse", lhs: [f], rhs: a });

        const result = await notebook.validate();
        expect(result.issues).toEqual([]);
        const judgments = result.model.judgmentsOf(PathEquation);
        expect(judgments.length).toBe(1);
        const judgment = judgments[0];
        if (!judgment || judgment.kind !== "path-equation") {
            throw new Error("Expected an equation judgment.");
        }
        const cell = notebook.document.notebook.cellContents[equation.id];
        if (!cell || cell.tag !== "formal" || cell.content.tag !== "equation") {
            throw new Error("Expected an equation cell.");
        }
        expect(judgment.id).toBe(cell.content.id);
        expect(judgment.label).toEqual(["inverse"]);
        if (judgment.lhs.kind !== "composite") {
            throw new Error("Expected the left-hand side to be a composite.");
        }
        expect(judgment.lhs.morphisms.map((mor) => mor?.label)).toEqual([["f"]]);
        const rhs = judgment.rhs;
        if (rhs.kind !== "object") {
            throw new Error("Expected the right-hand side to be an identity.");
        }
        expect(rhs.label).toEqual(["A"]);
    });
});
