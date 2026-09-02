import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

import { createBinder, PathEquation, RichText } from "catcolab-documents";

describe("the simple-olog logic (advanced)", { timeout: 10000 }, () => {
    test.skip("notebooks validate against the core theory of categories", async () => {
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
        expect(equation.lhs.map((mor) => mor?.label)).toEqual(["f", "f"]);
        expect(equation.rhs.map((mor) => mor?.label)).toEqual(["f"]);
        expect(notebook.cellsOf(PathEquation).length).toBe(1);
    });

    test.skip("supportsInstances generates the .Diagram shape", async () => {
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
    });

    test.skip("ologs migrate to simple-schema", async () => {
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
        expect((await migration.content.validate()).issues).toEqual([]);
    });
});
