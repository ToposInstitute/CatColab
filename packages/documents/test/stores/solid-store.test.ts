import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Use with SolidJS and Automerge" — the SolidJS binder.
import { createBinder } from "catcolab-documents";
import { solidStore } from "./solid-store-fixture";

describe.skip("SolidJS binder", () => {
    test("a binder over a Solid store is used just as the default binder", async () => {
        const solidBinder = createBinder(solidStore);

        const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });
        expect(notebook.title).toBe("An Olog");

        const a = notebook.add(Type, { label: "A" });
        notebook.add(Type, { label: "B" });

        expect(notebook.cellsOf(Type).map((cell) => cell.label)).toEqual(["A", "B"]);

        a.update({ label: "A2" });
        expect(a.label).toBe("A2");
    });

    test("changes notify subscribers through the store", async () => {
        const solidBinder = createBinder(solidStore);
        const notebook = await solidBinder.createNotebook(SimpleOlog, { title: "An Olog" });

        let changes = 0;
        const unsubscribe = notebook.onChange(() => {
            changes += 1;
        });

        notebook.add(Type, { label: "A" });
        expect(changes).toBeGreaterThan(0);

        unsubscribe();
    });
});
