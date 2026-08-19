import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// The `simple-olog` logic (RFC-0006 "Defining notebook shapes").
//
// `catcolab-logics/simple-olog` binds the theory of categories to the frontend
// as a shape: a basic `Type` object, a `Hom` `Aspect` morphism, rich text,
// equations, instances (diagrams) and a migration to `simple-schema`.
import { createBinder, PathEquation, RichText } from "catcolab-documents";

describe("the simple-olog logic", () => {
    test("Type is the basic Object and Aspect is a Hom over it", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        expect(notebook.document.theory).toBe("simple-olog");

        const a = notebook.add(Type, { label: "A" });
        const b = notebook.add(Type, { label: "B" });
        const has = notebook.add(Aspect, { label: "has", from: a, to: b });

        expect(Type.obType).toEqual({ tag: "Basic", content: "Object" });
        expect(a.type.obType.content).toBe("Object");
        expect(has.type.morType.tag).toBe("Hom");
    });

    test("notebooks validate against the core theory of categories", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const b = notebook.add(Type, { label: "B" });
        notebook.add(Aspect, { label: "has", from: a, to: b });

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
        if (result.tag !== "Ok") {
            return;
        }
        expect(result.content.obGenerators().length).toBe(2);
        expect(result.content.morGenerators().length).toBe(1);
    });

    test("the shape supports rich text and path equations", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const note = notebook.add(RichText, { content: "A note." });
        expect(note.content).toBe("A note.");

        const a = notebook.add(Type, { label: "A" });
        const f = notebook.add(Aspect, { label: "f", from: a, to: a });
        const g = notebook.add(Aspect, { label: "g", from: a, to: a });

        const equation = notebook.add(PathEquation, {
            label: "idempotent",
            lhs: [f, f],
            rhs: [g],
        });
        expect(equation.lhs.map((step) => step.label)).toEqual(["f", "f"]);
        expect(notebook.cellsOf(PathEquation).length).toBe(1);
    });

    test("supportsInstances generates a diagram shape and configures tables", async () => {
        const binder = createBinder();
        const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const A = model.add(Type, { label: "A" });
        const B = model.add(Type, { label: "B" });
        const has = model.add(Aspect, { label: "has", from: A, to: B });

        const diagram = await binder.createNotebook(SimpleOlog.Diagram, {
            title: "Olog diagram",
            in: model,
        });

        const x = diagram.add(SimpleOlog.Diagram.Individual, { label: "x", over: A });
        const y = diagram.add(SimpleOlog.Diagram.Individual, { label: "y", over: B });
        const f = diagram.add(SimpleOlog.Diagram.Aspect, { from: x, to: y, over: has });

        expect(x.over?.label).toBe("A");
        expect(f.over?.label).toBe("has");
        expect(SimpleOlog.supportsInstances?.tableObjects).toEqual([Type]);
    });

    test("ologs migrate to simple-schema", async () => {
        const binder = createBinder();
        const olog = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = olog.add(Type, { label: "A" });
        const b = olog.add(Type, { label: "B" });
        olog.add(Aspect, { label: "has", from: a, to: b });

        const migration = await olog.migrateTo(SimpleSchema);
        expect(migration.tag).toBe("Ok");
        if (migration.tag !== "Ok") {
            return;
        }
        expect(migration.content.document.theory).toBe("simple-schema");
        expect((await migration.content.validate()).tag).toBe("Ok");
    });
});
