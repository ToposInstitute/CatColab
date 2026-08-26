import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createEffect, createRoot } from "solid-js";
import { describe, expect, test } from "vitest";

// RFC-0006 "Use with SolidJS and Automerge" — reactive validation views over a
// SolidJS document store.
import { createBinder } from "catcolab-documents";
import { solidStore } from "./solid-store-fixture";

describe("reactive validation view", { timeout: 20000 }, () => {
    test("tracks validation state and judgments in a Solid effect", async () => {
        const solidBinder = createBinder(solidStore);
        const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });
        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        notebook.add(Aspect, { label: "has", from: source, to: target });

        const view = notebook.createValidationView();

        let issueCount = -1;
        let labels: string[] = [];
        const dispose = createRoot((dispose) => {
            createEffect(() => {
                issueCount = view.issues.length;
                labels = view.model.judgments().map((judgment) => judgment.label.join("."));
            });
            return dispose;
        });

        await expect.poll(() => issueCount, { timeout: 10000 }).toBe(0);
        expect(labels).toEqual(["A", "B", "has"]);

        // Adding an object updates the judgments through the reactive view.
        notebook.add(Type, { label: "C" });
        await expect.poll(() => labels).toEqual(["A", "B", "C", "has"]);

        // An ill-formed change (an aspect without endpoints) surfaces issues,
        // while the elaborated model stays available.
        notebook.add(Aspect, { label: "dangling", from: null, to: null });
        await expect.poll(() => issueCount).toBeGreaterThan(0);
        expect(labels).toEqual(["A", "B", "C", "has"]);

        // Disposing the last view releases the store subscription.
        expect(notebook.handle.listeners.size).toBeGreaterThan(0);
        view.dispose();
        expect(notebook.handle.listeners.size).toBe(0);
        dispose();
    });
});
