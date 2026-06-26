/*
 * A companion to `simple_schema_completions`, this test shows why
 * `notebook.formalCells()` is a poor `createResource` source — and how
 * `notebook.onChange` fixes it.
 *
 * `formalCells()` rebuilds its result on every call: it maps over the
 * notebook's reactive cell order into a brand new array of freshly-constructed
 * cell handles (see `src/future/index.ts`, `formalCells` -> `cells`). So two
 * consecutive reads are never referentially equal (`formalCells() !==
 * formalCells()`), even with no edits in between. Used directly as a
 * `createResource` source the value therefore *always* compares as changed, so
 * the resource re-validates on every tracked change — including edits that
 * leave the formal cells untouched, such as adding a `RichText` comment.
 *
 * The fix is `notebook.onChange`: a change notification sourced from the store
 * (so it also fires for remote edits, e.g. another Automerge collaborator).
 * Bumping a signal from `onChange` and keying the resource source on a *stable*
 * signature — the formal-cell ids joined into a string — lets the resource
 * dedupe: an unrelated edit bumps the signal but produces the same signature,
 * so no re-validation happens, while adding a formal cell changes the signature
 * and does re-validate.
 */
/* oxlint-disable unicorn/consistent-function-scoping */
import { createBinder, type DocumentStore, RichText } from "catcolab-documents";
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { createResource, createRoot, createSignal, type Resource } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";

/** Test helper: wait until a resource has finished (re)loading. */
async function settled(resource: Resource<unknown>) {
    while (resource.loading) {
        await new Promise((resolve) => setTimeout(resolve));
    }
}

type SolidStoreHandle = {
    doc: ModelDocument;
    setDoc: SetStoreFunction<ModelDocument>;
    listeners: Set<() => void>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc as ModelDocument);
        return { doc, setDoc, listeners: new Set() };
    },
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => {
        handle.setDoc(produce<ModelDocument>(fn));
        // Notify subscribers after the mutation. A real reactive store (Solid,
        // Automerge) detects changes however they arrive; this fixture has only
        // one mutation path — `changeDocument` — so notifying here is complete.
        for (const listener of Array.from(handle.listeners)) {
            listener();
        }
    },
    subscribe: (handle, callback) => {
        handle.listeners.add(callback);
        return () => {
            handle.listeners.delete(callback);
        };
    },
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    linkForHandle: () => undefined,
    resolveModel: async () => {
        throw new Error("this store cannot resolve model references");
    },
    resolveAnalysis: async () => {
        throw new Error("this store cannot resolve analyses");
    },
};

const solidBinder = createBinder(solidStore);

describe("simple-schema formalCells() validation resource", () => {
    test("formalCells() returns a fresh array each call", () => {
        const notebook = solidBinder.createNotebook(SimpleSchema, { name: "Company schema" });
        const person = notebook.add(Entity, { name: "Person" });
        const str = notebook.add(AttrType, { name: "String" });
        notebook.add(Attr, { name: "name", from: person, to: str });

        const first = notebook.formalCells();
        const second = notebook.formalCells();

        // The arrays carry the same formal cells (same ids, same order)...
        expect(first.map((cell) => cell.id)).toEqual(second.map((cell) => cell.id));
        // ...yet they are distinct array instances built of fresh handles, so
        // referential equality — what `createResource` relies on to dedupe —
        // never holds. This is exactly why `formalCells()` cannot be a resource
        // source on its own.
        expect(first).not.toBe(second);
        expect(first[0]).not.toBe(second[0]);
    });

    test("onChange fires for every change to the notebook", () => {
        const notebook = solidBinder.createNotebook(SimpleSchema, { name: "Company schema" });

        let changes = 0;
        const unsubscribe = notebook.onChange(() => {
            changes += 1;
        });

        const person = notebook.add(Entity, { name: "Person" });
        expect(changes).toBe(1);

        person.update({ name: "Human" });
        expect(changes).toBe(2);

        notebook.add(RichText, { content: "A note." });
        expect(changes).toBe(3);

        // After unsubscribing, further edits are not reported.
        unsubscribe();
        notebook.add(AttrType, { name: "String" });
        expect(changes).toBe(3);
    });

    test("keying validation on onChange + formal-cell ids dedupes unrelated edits", async () => {
        const notebook = solidBinder.createNotebook(SimpleSchema, { name: "Company schema" });
        const person = notebook.add(Entity, { name: "Person" });
        const str = notebook.add(AttrType, { name: "String" });
        notebook.add(Attr, { name: "name", from: person, to: str });

        // Count how many times the resource fetcher actually re-validates.
        let validations = 0;

        await createRoot(async (dispose) => {
            // `onChange` bumps a signal; the resource source reads that signal
            // (so it re-runs on any change) but returns a *stable* signature —
            // the formal-cell ids — so the resource only refetches when the
            // formal cells themselves change.
            const [revision, setRevision] = createSignal(0);
            const unsubscribe = notebook.onChange(() => setRevision((n) => n + 1));

            const [validation] = createResource(
                () => {
                    revision();
                    return notebook
                        .formalCells()
                        .map((cell) => cell.id)
                        .join("\u0000");
                },
                () => {
                    validations += 1;
                    return notebook.validate();
                },
            );

            await settled(validation);
            expect(validation()?.tag).not.toBe("Illformed");
            expect(validations).toBe(1);

            const formalIdsBefore = notebook.formalCells().map((cell) => cell.id);

            // Add a rich-text comment. `formalCells()` filters rich text out, so
            // the formal-cell signature is unchanged: no re-validation warranted.
            notebook.add(RichText, { content: "An explanatory note." });
            await settled(validation);

            const formalIdsAfter = notebook.formalCells().map((cell) => cell.id);
            expect(formalIdsAfter).toEqual(formalIdsBefore);
            // The signature did not change, so the resource did not refetch.
            expect(validations).toBe(1);

            // Adding a *formal* cell changes the signature and does re-validate.
            notebook.add(Entity, { name: "Company" });
            await settled(validation);
            expect(validations).toBe(2);

            unsubscribe();
            dispose();
        });
    });
});
