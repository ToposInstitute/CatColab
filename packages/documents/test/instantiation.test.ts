import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Instantiation".
//
// Instantiation is just another cell type provided by `catcolab-documents`. The
// initial implementation only supports instantiation of notebooks already
// defined in the local binder.
import { createBinder, Instantiation } from "catcolab-documents";

describe.skip("instantiation", () => {
    test("a notebook from the same binder can be instantiated with specializations", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });
        const target = notebook.add(Type, { label: "B" });

        const anotherOlog = await binder.createNotebook(SimpleOlog, { title: "Another Olog" });
        const thing = anotherOlog.add(Type, { label: "Thing" });

        const instantiation = notebook.add(Instantiation, {
            label: "ImportedOlog",
            model: anotherOlog,
            // maps ImportedOlog.Thing <- B
            specializations: [{ object: thing, as: target }],
        });

        expect(instantiation.label).toBe("ImportedOlog");
        expect(notebook.cellsOf(Instantiation).length).toBe(1);
        expect(notebook.cellsOf(Instantiation)[0]?.id).toBe(instantiation.id);

        // Instantiating a valid notebook keeps this notebook valid.
        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
    });
});
