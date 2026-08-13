import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

/**
 * Tests for `onValidate`, the dependency-driven validation observer: it
 * re-validates when — and only when — a document the validation depends on
 * changes (the notebook itself *or* anything in its resolution subtree), and
 * delivers only results that differ from the last delivered one.
 */
import {
    createBinder,
    type DiagramValidationResult,
    Instantiation,
    type ModelValidationResult,
    RichText,
} from "catcolab-documents";
import { createResolvingStore } from "./resolving_store";

/** Poll until `predicate` holds (validation is asynchronous). */
async function until(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error("condition not met in time");
        }
        await new Promise((resolve) => setTimeout(resolve));
    }
}

/** Let any in-flight observation settle, to assert that nothing more arrives. */
async function flush(): Promise<void> {
    for (let i = 0; i < 25; i++) {
        await new Promise((resolve) => setTimeout(resolve));
    }
}

describe("onValidate", () => {
    test("delivers an initial result, then only actual changes", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Type, { label: "A" });

        const results: ModelValidationResult[] = [];
        const unsubscribe = notebook.onValidate((result) => results.push(result));

        await until(() => results.length === 1);
        expect(results[0]?.tag).toBe("Ok");

        // Non-formal changes: a rich-text comment and a rename re-validate (the
        // cache absorbs the cost) but deliver nothing — the model is identical.
        notebook.add(RichText, { content: "A comment." });
        notebook.update({ title: "Renamed" });
        await flush();
        expect(results.length).toBe(1);

        // A formal edit delivers a new result with a new model.
        notebook.add(Type, { label: "B" });
        await until(() => results.length === 2);
        expect(results[1]?.tag).toBe("Ok");
        expect(results[1]?.tag === "Ok" && results[1].content).not.toBe(
            results[0]?.tag === "Ok" && results[0].content,
        );

        unsubscribe();
    });

    test("a burst of synchronous edits is coalesced into one delivery", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Type, { label: "A" });

        const results: ModelValidationResult[] = [];
        const unsubscribe = notebook.onValidate((result) => results.push(result));
        await until(() => results.length === 1);

        notebook.add(Type, { label: "B" });
        notebook.add(Type, { label: "C" });
        notebook.add(Type, { label: "D" });
        await until(() => results.length === 2);
        await flush();
        expect(results.length).toBe(2);

        unsubscribe();
    });

    test("an edit to an instantiated child re-validates the parent", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const imported = await binder.createNotebook(SimpleOlog, { title: "Imported" });
        imported.add(Type, { label: "Thing" });
        const main = await binder.createNotebook(SimpleOlog, { title: "Main" });
        main.add(Type, { label: "A" });
        main.add(Instantiation, { label: "Import", model: imported });

        const results: ModelValidationResult[] = [];
        const unsubscribe = main.onValidate((result) => results.push(result));
        await until(() => results.length === 1);
        expect(results[0]?.tag).toBe("Ok");

        // The consumer never told the observer about `imported`: the dependency
        // was discovered from the resolution tree.
        imported.add(Type, { label: "Another" });
        await until(() => results.length === 2);
        expect(results[1]?.tag).toBe("Ok");

        // A rich-text edit to the child is a no-op for the parent, too.
        imported.add(RichText, { content: "Note on the import." });
        await flush();
        expect(results.length).toBe(2);

        unsubscribe();
    });

    test("errors are delivered and recovery is observed", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const a = await binder.createNotebook(SimpleOlog, { title: "A" });
        const c = await binder.createNotebook(SimpleOlog, { title: "C" });
        a.add(Type, { label: "TA" });
        c.add(Type, { label: "TC" });
        a.add(Instantiation, { label: "toC", model: c });

        const results: ModelValidationResult[] = [];
        const unsubscribe = a.onValidate((result) => results.push(result));
        await until(() => results.length === 1);
        expect(results[0]?.tag).toBe("Ok");

        // Editing `c` to instantiate `a` closes a cycle: delivered as an `Err`.
        const cycleCell = c.add(Instantiation, { label: "toA", model: a });
        await until(() => results.length === 2);
        expect(results[1]?.tag).toBe("Err");
        expect(
            results[1]?.tag === "Err" &&
                results[1].content.map((issue) => issue.message).join("; "),
        ).toContain("Instantiation cycle detected");

        // The failed resolution kept the dependency subscriptions, so breaking
        // the cycle in `c` is observed and recovery delivered.
        cycleCell.delete();
        await until(() => results.length === 3);
        expect(results[2]?.tag).toBe("Ok");

        unsubscribe();
    });

    test("unsubscribing stops delivery", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Main" });
        notebook.add(Type, { label: "A" });

        const results: ModelValidationResult[] = [];
        const unsubscribe = notebook.onValidate((result) => results.push(result));
        await until(() => results.length === 1);

        unsubscribe();
        notebook.add(Type, { label: "B" });
        await flush();
        expect(results.length).toBe(1);
    });

    test("an instance observes its schema without manual wiring", async () => {
        const { store } = createResolvingStore();
        const binder = createBinder(store);

        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });
        schema.add(Mapping, { label: "employer", from: person, to: company });
        schema.add(Attr, { label: "name", from: person, to: str });

        const instance = await binder.createInstance(schema, { title: "Company instance" });
        const acme = instance.add(company, {});
        instance.add(person, { name: "Fred", employer: acme });

        const results: DiagramValidationResult[] = [];
        const unsubscribe = instance.onValidate((result) => results.push(result));
        await until(() => results.length === 1);
        expect(results[0]?.tag).toBe("Valid");

        // A schema edit re-validates the instance: the observer follows the
        // schema through the cache's dependency tree, with no subscription to
        // the schema notebook at the call site.
        schema.add(Entity, { label: "Department" });
        await until(() => results.length === 2);
        expect(results[1]?.tag).toBe("Valid");

        // A row edit delivers too — same tag, but new content.
        instance.add(person, { name: "Barney", employer: acme });
        await until(() => results.length === 3);
        expect(results[2]?.tag).toBe("Valid");

        // A rename of the instance is a no-op.
        instance.update({ title: "Renamed instance" });
        await flush();
        expect(results.length).toBe(3);

        unsubscribe();
    });
});
