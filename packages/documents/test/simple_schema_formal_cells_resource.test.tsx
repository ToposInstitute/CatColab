import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { createStore, reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
/*
 * A companion to `simple_schema_completions`, this test shows why
 * `notebook.formalCells()` is a poor `createResource` source — and how
 * `notebook.onChange` fixes it.
 *
 * `formalCells()` rebuilds its result on every call: it maps over the
 * notebook's reactive cell order into a brand new array of freshly-constructed
 * cell handles (see `src/index.ts`, `formalCells` -> `cells`). So two
 * consecutive reads are never referentially equal (`formalCells() !==
 * formalCells()`), even with no edits in between. Used directly as a
 * `createResource` source the value therefore *always* compares as changed, so
 * the resource re-validates on every tracked change — including edits that
 * leave the formal cells untouched, such as adding a `RichText` comment.
 *
 * The building blocks are `notebook.onChange` (a change notification sourced
 * from the store, so it also fires for remote edits, e.g. another Automerge
 * collaborator). For *validation*, components need neither directly:
 * `notebook.onValidate` re-validates on changes to anything the validation
 * depends on and delivers only results that actually differ, which the last
 * test demonstrates.
 */
/* oxlint-disable unicorn/consistent-function-scoping */
import {
    createBinder,
    type DocumentStore,
    type ModelValidationResult,
    RichText,
} from "catcolab-documents";
import { selfResolving } from "./self_resolving";

/** Test helper: poll until `predicate` holds (validation is asynchronous). */
async function until(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error("condition not met in time");
        }
        await new Promise((resolve) => setTimeout(resolve));
    }
}

/** Test helper: let any in-flight observation settle. */
async function flush(): Promise<void> {
    for (let i = 0; i < 25; i++) {
        await new Promise((resolve) => setTimeout(resolve));
    }
}

type SolidStoreHandle = {
    draftDoc: Document;
    docView: Document;
    setDocView: SetStoreFunction<Document>;
    listeners: Set<() => void>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    async createHandle(initialDoc) {
        const draftDoc = structuredClone(initialDoc as Document);
        const [docView, setDocView] = createStore<Document>(initialDoc as Document);
        return { draftDoc, docView, setDocView, listeners: new Set() };
    },
    getDocumentView: (handle) => handle.docView,
    changeDocument: (handle, fn) => {
        fn(handle.draftDoc);
        handle.setDocView(reconcile(structuredClone(handle.draftDoc), { key: "id" }));
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
    // Resolve a notebook's own model (validation now goes through the store).
    ...selfResolving<SolidStoreHandle>(),
};

const solidBinder = createBinder(solidStore);

describe("simple-schema formalCells() validation resource", () => {
    test("formalCells() returns a fresh array each call", async () => {
        const notebook = await solidBinder.createNotebook(SimpleSchema, {
            title: "Company schema",
        });
        const person = notebook.add(Entity, { label: "Person" });
        const str = notebook.add(AttrType, { label: "String" });
        notebook.add(Attr, { label: "name", from: person, to: str });

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

    test("onChange fires for every change to the notebook", async () => {
        const notebook = await solidBinder.createNotebook(SimpleSchema, {
            title: "Company schema",
        });

        let changes = 0;
        const unsubscribe = notebook.onChange(() => {
            changes += 1;
        });

        const person = notebook.add(Entity, { label: "Person" });
        expect(changes).toBe(1);

        person.update({ label: "Human" });
        expect(changes).toBe(2);

        notebook.add(RichText, { content: "A note." });
        expect(changes).toBe(3);

        // After unsubscribing, further edits are not reported.
        unsubscribe();
        notebook.add(AttrType, { label: "String" });
        expect(changes).toBe(3);
    });

    test("onChange fires when an entity's name is updated", async () => {
        const notebook = await solidBinder.createNotebook(SimpleSchema, {
            title: "Company schema",
        });
        const person = notebook.add(Entity, { label: "Person" });

        let changes = 0;
        const unsubscribe = notebook.onChange(() => {
            changes += 1;
        });

        // Updating an entity's name mutates nested cell content
        // (`cellContents[id].content.name`) rather than replacing the cell. The
        // change still flows through `changeDocument`, so `onChange` fires and
        // the new name is observable.
        person.update({ label: "Human" });
        expect(changes).toBe(1);
        expect(person.label).toBe("Human");

        // A second update to the same nested content fires `onChange` again.
        person.update({ label: "Individual" });
        expect(changes).toBe(2);
        expect(person.label).toBe("Individual");

        unsubscribe();
    });

    test("onValidate delivers only when the validation result changes", async () => {
        const notebook = await solidBinder.createNotebook(SimpleSchema, {
            title: "Company schema",
        });
        const person = notebook.add(Entity, { label: "Person" });
        const str = notebook.add(AttrType, { label: "String" });
        notebook.add(Attr, { label: "name", from: person, to: str });

        // `onValidate` replaces the whole revision-signal + resource dance:
        // it re-validates on changes to anything the validation depends on
        // (cheap, through the elaboration cache) and delivers only results that
        // differ from the last delivered one — so unrelated edits cause no
        // deliveries, and hence no re-renders in a consumer wired to a signal.
        const results: ModelValidationResult[] = [];
        const unsubscribe = notebook.onValidate((result) => results.push(result));

        await until(() => results.length === 1);
        expect(results[0]?.tag).toBe("Ok");

        // Add a rich-text comment. It is not a formal cell, so the elaborated
        // model is unchanged: nothing is delivered.
        notebook.add(RichText, { content: "An explanatory note." });
        await flush();
        expect(results.length).toBe(1);

        // Editing a *formal* cell in place changes the elaborated model, so a
        // fresh result is delivered.
        person.update({ label: "Human" });
        await until(() => results.length === 2);

        // Adding a *formal* cell delivers again.
        notebook.add(Entity, { label: "Company" });
        await until(() => results.length === 3);

        // After unsubscribing, further edits deliver nothing.
        unsubscribe();
        notebook.add(Entity, { label: "Office" });
        await flush();
        expect(results.length).toBe(3);
    });
});
