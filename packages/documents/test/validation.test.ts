import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Model validation": the asynchronous `validate` method, subscribing
// to validation changes with `onValidate`, and validation failures.
import { createBinder, Instantiation, type Result } from "catcolab-documents";
import type { DblModel } from "catlog-wasm";

async function wellFormedOlog() {
    const binder = createBinder();
    const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

    const source = notebook.add(Type, { label: "A" });
    const target = notebook.add(Type, { label: "B" });
    notebook.add(Aspect, { label: "has", from: source, to: target });

    return notebook;
}

describe("validate", () => {
    test("a well-formed notebook validates to an Ok carrying the model", async () => {
        const notebook = await wellFormedOlog();

        const result: Result<DblModel> = await notebook.validate();
        expect(result.tag).toBe("Ok");
    });

    test("the validated model is available on the result and can be queried", async () => {
        const notebook = await wellFormedOlog();

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
        if (result.tag !== "Ok") {
            return;
        }
        expect(result.content.obGenerators().length).toBe(2);
        expect(result.content.morGenerators().length).toBe(1);
    });

    test("queries typed presentation judgments without replacing the core model", async () => {
        const notebook = await wellFormedOlog();
        const source = notebook.cellsOf(Type)[0];
        if (!source) {
            throw new Error("expected an object cell");
        }

        const result = await notebook.validate();
        const again = await notebook.validate();
        if (result.tag !== "Ok" || again.tag !== "Ok") {
            throw new Error("expected the notebook to validate");
        }

        expect(result.content).toBe(again.content);
        expect(result.content.judgmentsOf(Type).map((judgment) => judgment.label)).toEqual([
            "A",
            "B",
        ]);
        expect(result.content.judgmentsOf(Aspect).map((judgment) => judgment.label)).toEqual([
            "has",
        ]);
        expect(result.content.get(Type, source.id)).toMatchObject({
            tag: "Ok",
            content: { id: source.id },
        });
        expect(result.content.get(Aspect, source.id)).toMatchObject({
            tag: "Err",
            content: [{ path: ["id"] }],
        });
    });
});

describe("onValidate", () => {
    test("always calls the callback at least once with the current validation", async () => {
        const notebook = await wellFormedOlog();

        const first = await new Promise<Result<DblModel>>((resolve) => {
            const unsubscribe = notebook.onValidate((result: Result<DblModel>) => {
                resolve(result);
                unsubscribe();
            });
        });

        expect(first.tag).toBe("Ok");
    });

    test("notifies when changes to the formal content affect the validation result", async () => {
        const notebook = await wellFormedOlog();

        const results: Result<DblModel>[] = [];
        const unsubscribe = notebook.onValidate((result: Result<DblModel>) => {
            results.push(result);
        });

        // Wait for the initial validation.
        while (results.length === 0) {
            await new Promise((resolve) => setTimeout(resolve));
        }
        const initialCount = results.length;

        notebook.add(Type, { label: "C" });
        while (results.length === initialCount) {
            await new Promise((resolve) => setTimeout(resolve));
        }

        unsubscribe();

        const latest = results[results.length - 1];
        expect(latest?.tag).toBe("Ok");
        if (latest?.tag !== "Ok") {
            return;
        }
        expect(latest.content.obGenerators().length).toBe(3);
    });
});

describe("validation result", () => {
    test("an ill-formed notebook results in an Err carrying issues", async () => {
        const binder = createBinder();

        const first = await binder.createNotebook(SimpleOlog, { title: "First" });
        const second = await binder.createNotebook(SimpleOlog, { title: "Second" });

        first.add(Type, { label: "A" });
        second.add(Type, { label: "B" });

        // A cycle: `first` instantiates `second`, which instantiates `first`.
        first.add(Instantiation, { label: "ImportedSecond", model: second });
        second.add(Instantiation, { label: "ImportedFirst", model: first });

        const result = await first.validate();
        expect(result.tag).toBe("Err");
        if (result.tag !== "Err") {
            return;
        }
        expect(result.content.map((issue) => issue.message).join("; ")).toBe(
            'Instantiation cycle detected: "First" → "Second" → "First". ' +
                "A notebook cannot instantiate itself, directly or indirectly. " +
                "To fix, remove one of the instantiations in this chain.",
        );
    });
});
