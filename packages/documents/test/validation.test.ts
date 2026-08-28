import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Model validation": the asynchronous `validate` method, subscribing
// to validation changes with `onValidate`, and validation issues.
import { createBinder, defineShape, Instantiation, type ModelValidation } from "catcolab-documents";

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
describe("validate", { timeout: 10000 }, () => {
    test("a well-formed notebook validates without issues", async () => {
        const notebook = await wellFormedOlog();

        const result: ModelValidation<typeof SimpleOlog> = await notebook.validate();
        expect(result.issues).toEqual([]);
    });

    test("the elaborated model is available on the result and can be queried", async () => {
        const notebook = await wellFormedOlog();

        const result = await notebook.validate();
        expect(result.model.judgmentsOf(Type).length).toBe(2);
        expect(result.model.judgmentsOf(Aspect).length).toBe(1);
    });

    test("an invalid notebook still returns its elaborated model", async () => {
        const notebook = await wellFormedOlog();
        notebook.add(Aspect, { label: "dangling", from: null, to: null });

        const result = await notebook.validate();

        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.model.judgmentsOf(Type).length).toBe(2);
        expect(result.model.judgmentsOf(Aspect).map((judgment) => judgment.label)).toEqual([
            ["has"],
        ]);
    });

    test("a missing core theory reports issues with an empty model", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(defineShape({ theory: "bare" }), {
            title: "Bare notebook",
        });

        const result = await notebook.validate();

        expect(result.issues).toEqual([{ message: "Shape `bare` has no core theory" }]);
        expect(result.model.judgments()).toEqual([]);
    });
});

describe("onValidate", { timeout: 10000 }, () => {
    test("always calls the callback at least once with the current validation", async () => {
        const notebook = await wellFormedOlog();

        const first = await new Promise<ModelValidation<typeof SimpleOlog>>((resolve) => {
            const unsubscribe = notebook.onValidate((result) => {
                resolve(result);
                unsubscribe();
            });
        });

        expect(first.issues).toEqual([]);
    });

    test("notifies when changes to the formal content affect the validation result", async () => {
        const notebook = await wellFormedOlog();

        const results: ModelValidation<typeof SimpleOlog>[] = [];
        const unsubscribe = notebook.onValidate((result) => {
            results.push(result);
        });

        // Wait for the initial validation.
        while (results.length === 0) {
            await new Promise((resolve) => setTimeout(resolve));
        }
        const initialCount = results.length;

        const source = notebook.cellsOf(Type)[0];
        if (!source) {
            throw new Error("Expected a source object");
        }
        source.delete();

        while (results.length === initialCount) {
            await new Promise((resolve) => setTimeout(resolve));
        }
        unsubscribe();

        const latest = results[results.length - 1];
        expect(latest?.issues.length).toBeGreaterThan(0);
        expect(latest?.model.judgmentsOf(Type).map((judgment) => judgment.label)).toEqual([["B"]]);
    });
});

describe.skip("validation issues", () => {
    test("an ill-formed notebook reports issues", async () => {
        const binder = createBinder();

        const first = await binder.createNotebook(SimpleOlog, { title: "First" });
        const second = await binder.createNotebook(SimpleOlog, { title: "Second" });

        first.add(Type, { label: "A" });
        second.add(Type, { label: "B" });

        // A cycle: `first` instantiates `second`, which instantiates `first`.
        first.add(Instantiation, { label: "ImportedSecond", model: second });
        second.add(Instantiation, { label: "ImportedFirst", model: first });

        const result = await first.validate();
        expect(result.issues.map((issue) => issue.message).join("; ")).toBe(
            'Instantiation cycle detected: "First" → "Second" → "First". ' +
                "A notebook cannot instantiate itself, directly or indirectly. " +
                "To fix, remove one of the instantiations in this chain.",
        );
    });
});
