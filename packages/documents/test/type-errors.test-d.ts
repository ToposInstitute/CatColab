import { PetriNet, Place, Transition } from "catcolab-logics/petri-net";
import { AttrType, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, test } from "vitest";

// RFC-0006 "Type errors" and "Further type errors".
//
// TypeScript type checking gives confidence that use of the notebook API makes
// sense and is free of misspellings or other issues that would throw errors at
// runtime. These cases are checked by the compiler only (vitest typecheck
// mode); nothing here executes.
import { createBinder } from "catcolab-documents";

describe.skip("type errors", () => {
    test("a mapping's endpoints must be entities, not attribute types", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const str = schema.add(AttrType, { label: "String" });

        // @ts-expect-error A mapping's endpoints must be entities, not attribute types.
        schema.add(Mapping, {
            label: "bad",
            from: str,
            to: str,
        });
    });

    test("endpoint shapes adapt to the underlying logic", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(PetriNet, { title: "Example Petri-net" });

        const a = notebook.add(Place, { label: "A" });
        const b = notebook.add(Place, { label: "B" });
        const c = notebook.add(Place, { label: "C" });

        notebook.add(Transition, {
            label: "t1",
            from: [a, b],
            to: [c],
        });

        // @ts-expect-error Petri net transitions require arrays of places.
        notebook.add(Transition, {
            label: "bad",
            from: a,
            to: [c],
        });
    });
});
