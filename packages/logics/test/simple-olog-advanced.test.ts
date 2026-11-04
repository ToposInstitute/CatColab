import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, PathEquation, RichText } from "catcolab-documents";
import { expectOk, migrateCoreModel } from "./helpers";

describe("the simple-olog logic (advanced)", { timeout: 60_000 }, () => {
    test("notebooks validate against the core theory of categories", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const b = notebook.add(Type, { label: "B" });
        notebook.add(Aspect, { label: "has", from: a, to: b });

        const result = await notebook.validate();
        expect(result.issues).toEqual([]);
        expect(result.model.judgmentsOf(Type).length).toBe(2);
        expect(result.model.judgmentsOf(Aspect).length).toBe(1);
    });

    test("the shape supports rich text and path equations", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const note = notebook.add(RichText, { content: "A note." });
        expect(note.content).toBe("A note.");

        const a = notebook.add(Type, { label: "A" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });

        const equation = notebook.add(PathEquation, {
            label: "idempotent",
            lhs: [f, f],
            rhs: [f],
        });
        if (!Array.isArray(equation.lhs) || !Array.isArray(equation.rhs)) {
            throw new Error("Expected composite equation sides");
        }
        expect(equation.lhs.map((mor) => mor?.label)).toEqual(["f", "f"]);
        expect(equation.rhs.map((mor) => mor?.label)).toEqual(["f"]);
        expect(notebook.cellsOf(PathEquation).length).toBe(1);
    });

    test("supportsInstances enables tabular instances", async () => {
        const binder = createBinder();
        const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const A = model.add(Type, { label: "A" });
        const B = model.add(Type, { label: "B" });
        model.add(Aspect, { label: "has", from: A, to: B });

        const instance = expectOk(await binder.createInstance(model, { title: "Olog instance" }));
        const tables = (await instance.validate()).tables;
        const aTable = tables.find((table) => table.label === "A")!;
        const bTable = tables.find((table) => table.label === "B")!;
        const y = expectOk(await instance.addRow(bTable));
        expectOk(await instance.addRow(aTable, { has: y }));
        expect((await instance.validate()).issues).toEqual([]);
    });

    test("ologs migrate to simple-schema", async () => {
        const binder = createBinder();
        const olog = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = olog.add(Type, { label: "A" });
        const b = olog.add(Type, { label: "B" });
        olog.add(Aspect, { label: "has", from: a, to: b });

        const { ThCategory } = await import("catlog-wasm");
        const migrated = await migrateCoreModel(olog, SimpleSchema, ThCategory.toSchema);
        expect(migrated.obGenerators.map((ob) => ob.obType)).toEqual([
            Entity.obType,
            Entity.obType,
        ]);
        expect(migrated.morGenerators.map((mor) => mor.morType)).toEqual([Mapping.morType]);
    });
});
