import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
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

    test("threads model and instance reactivity through an instance view", async () => {
        const solidBinder = createBinder(solidStore);
        const schema = await solidBinder.createNotebook(SimpleSchema, {
            title: "Company schema",
        });
        const person = schema.add(Entity, { label: "Person" });
        const string = schema.add(AttrType, { label: "String" });
        schema.add(Attr, { label: "name", from: person, to: string });
        const instanceResult = await solidBinder.createInstance(schema, {
            title: "Company instance",
        });
        if (instanceResult.tag === "Err") {
            throw new Error("Expected the instance to be created");
        }
        const instance = instanceResult.content;
        const view = instance.createValidationView();

        let tableLabels: Array<string | null> = [];
        let headerLabels: Array<string | null> = [];
        let rowCount = -1;
        let issueTypes: string[] = [];
        let schemaIssueCount = -1;
        const dispose = createRoot((dispose) => {
            // All observed state comes from one view; no signals are updated manually.
            createEffect(() => {
                schemaIssueCount = view.modelValidation.issues.length;
                const tables = view.tables;
                tableLabels = tables.map((table) => table.label);
                headerLabels = tables[0]?.headers.map((header) => header.label) ?? [];
                rowCount = tables[0]?.rows.length ?? -1;
                issueTypes = view.issues.map((issue) => issue.issueType);
            });
            return dispose;
        });

        await expect.poll(() => schemaIssueCount, { timeout: 10000 }).toBe(0);
        expect(tableLabels).toEqual(["Person"]);
        expect(headerLabels).toEqual(["name"]);
        expect(rowCount).toBe(0);

        const personTable = view.tables[0];
        if (personTable === undefined) {
            throw new Error("Expected the Person table");
        }
        // An instance edit updates the row count without refreshing the view.
        const rowResult = await instance.addRow(personTable, { name: "Alice" });
        if (rowResult.tag === "Err") {
            throw new Error("Expected the row to be added");
        }
        await expect.poll(() => rowCount).toBe(1);

        // A schema edit updates both the derived headers and instance issues.
        schema.add(Attr, { label: "role", from: person, to: string });
        await expect.poll(() => headerLabels).toEqual(["name", "role"]);
        await expect.poll(() => issueTypes).toEqual(["MissingValue"]);

        const roleHeader = view.tables[0]?.headers.find((header) => header.label === "role");
        if (roleHeader === undefined) {
            throw new Error("Expected the role header");
        }
        const setResult = await instance.set(rowResult.content, roleHeader, "Engineer");
        if (setResult.tag === "Err") {
            throw new Error("Expected the role to be set");
        }
        // Repairing the instance clears the issue through the same view.
        await expect.poll(() => issueTypes).toEqual([]);

        expect(instance.handle.listeners.size).toBeGreaterThan(0);
        expect(schema.handle.listeners.size).toBeGreaterThan(0);
        view.dispose();
        expect(instance.handle.listeners.size).toBe(0);
        expect(schema.handle.listeners.size).toBe(0);
        dispose();
    });
});
