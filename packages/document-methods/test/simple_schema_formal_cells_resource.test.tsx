/*
 * A companion to `simple_schema_completions`, this test shows *why*
 * `notebook.formalCells()` is a poor source for a validation
 * `createResource`.
 *
 * `formalCells()` rebuilds its result on every call: it maps over the
 * notebook's reactive cell order into a brand new array of freshly-constructed
 * cell handles (see `src/future/index.ts`, `formalCells` -> `cells`). So:
 *
 *   1. Two consecutive reads are never referentially equal
 *      (`formalCells() !== formalCells()`), even with no edits in between.
 *   2. As a `createResource` source, the value therefore *always* compares as
 *      changed. The resource can never dedupe, so it re-validates on every
 *      tracked change — including edits that leave the formal cells untouched,
 *      such as adding or editing a `RichText` comment.
 *
 * This test demonstrates (2) concretely: adding a rich-text cell — which
 * `formalCells()` explicitly filters out, leaving the formal-cell ids
 * identical — still triggers a wasteful re-validation, purely because the
 * source array's identity changed.
 */
/* oxlint-disable unicorn/consistent-function-scoping */
import { createBinder, type DocumentStore, RichText } from "catcolab-documents";
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { createResource, createRoot, type Resource } from "solid-js";
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
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc as ModelDocument);
        return { doc, setDoc };
    },
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => handle.setDoc(produce<ModelDocument>(fn)),
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
        // never holds.
        expect(first).not.toBe(second);
        expect(first[0]).not.toBe(second[0]);
    });

    test("keying validation on formalCells() re-validates on unrelated edits", async () => {
        const notebook = solidBinder.createNotebook(SimpleSchema, { name: "Company schema" });
        const person = notebook.add(Entity, { name: "Person" });
        const str = notebook.add(AttrType, { name: "String" });
        notebook.add(Attr, { name: "name", from: person, to: str });

        // Count how many times the resource fetcher actually re-validates.
        let validations = 0;

        await createRoot(async (dispose) => {
            const [validation] = createResource(
                () => notebook.formalCells(),
                () => {
                    validations += 1;
                    return notebook.validate();
                },
            );

            await settled(validation);
            expect(validation()?.tag).not.toBe("Illformed");
            expect(validations).toBe(1);

            // Record the formal-cell ids: this is the meaningful content a
            // validation resource ought to key on.
            const formalIdsBefore = notebook.formalCells().map((cell) => cell.id);

            // Add a rich-text comment. `formalCells()` filters rich text out, so
            // the set of formal cells is unchanged — no re-validation is
            // warranted.
            notebook.add(RichText, { content: "An explanatory note." });

            await settled(validation);

            const formalIdsAfter = notebook.formalCells().map((cell) => cell.id);
            expect(formalIdsAfter).toEqual(formalIdsBefore);

            // The validation resource *should not* have re-run: nothing it
            // depends on (the formal cells) changed. This assertion therefore
            // fails — `formalCells()` handed back a new array, so the source
            // compared as changed and forced a wasteful re-validation. The
            // failure demonstrates that `formalCells()` is unsuitable as a
            // `createResource` source.
            expect(validations).toBe(1);

            dispose();
        });
    });
});
