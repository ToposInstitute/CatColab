import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// The `simple-olog` logic (RFC-0006 "Defining notebook shapes").
import { createBinder } from "catcolab-documents";

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
});
