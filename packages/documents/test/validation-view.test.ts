import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Model validation": live validation views created with
// `createValidationView`.
import { createBinder } from "catcolab-documents";

async function wellFormedOlog() {
    const binder = createBinder();
    const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

    const source = notebook.add(Type, { label: "A" });
    const target = notebook.add(Type, { label: "B" });
    notebook.add(Aspect, { label: "has", from: source, to: target });

    return notebook;
}

// the first time tests run we incur the cost of loading the catlog-wasm bundle,
// so these tests have longer timeouts
describe("createValidationView", { timeout: 20000 }, () => {
    test("exposes validated judgments that mirror the notebook cells", async () => {
        const notebook = await wellFormedOlog();
        const view = notebook.createValidationView();

        // Nothing has been validated yet when the view is created, but the
        // model is still available (and empty).
        expect(view.issues.length).toBeGreaterThan(0);
        expect(view.model.judgments()).toHaveLength(0);

        await expect.poll(() => view.issues, { timeout: 20000 }).toEqual([]);
        const model = view.model;

        expect(model.judgments().map((judgment) => [judgment.kind, judgment.label])).toEqual([
            ["object", ["A"]],
            ["object", ["B"]],
            ["morphism", ["has"]],
        ]);
        expect(model.judgmentsOf(Type).map((judgment) => judgment.label)).toEqual([["A"], ["B"]]);

        const [has] = model.judgmentsOf(Aspect);
        if (has?.kind !== "morphism") {
            throw new Error("Expected a morphism judgment");
        }
        expect(has.from?.label).toEqual(["A"]);
        expect(has.to?.label).toEqual(["B"]);

        view.dispose();
    });

    test("revalidates when the notebook changes and reports failures", async () => {
        const notebook = await wellFormedOlog();
        const view = notebook.createValidationView();

        await expect.poll(() => view.issues, { timeout: 20000 }).toEqual([]);
        const model = view.model;

        notebook.add(Type, { label: "C" });
        await expect.poll(() => model.judgmentsOf(Type).length).toBe(3);

        // An aspect without endpoints makes the notebook ill-formed.
        notebook.add(Aspect, { label: "dangling", from: null, to: null });
        await expect.poll(() => view.issues.length).toBeGreaterThan(0);
        expect(view.issues.map((issue) => issue.message)).toEqual([
            "Morphism `dangling` has a mistyped domain",
        ]);

        // The elaborated model remains available while the notebook is
        // invalid; the dangling morphism is simply not part of it.
        expect(model.judgmentsOf(Type).length).toBe(3);
        expect(model.judgmentsOf(Aspect).map((judgment) => judgment.label)).toEqual([["has"]]);

        view.dispose();
    });
});
