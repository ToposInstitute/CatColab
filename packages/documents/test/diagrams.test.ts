import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Diagram notebooks": diagrams are another type of notebook with a
// very similar editing interface.
import { createBinder, RichText } from "catcolab-documents";

async function ologModel() {
    const binder = createBinder();
    const model = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

    const A = model.add(Type, { label: "A" });
    const B = model.add(Type, { label: "B" });
    const has = model.add(Aspect, { label: "has", from: A, to: B });

    return { binder, model, A, B, has };
}

describe("diagram notebooks", () => {
    test("a diagram notebook is created in a model", async () => {
        const { binder, model } = await ologModel();

        const diagram = await binder.createNotebook(SimpleOlog.Diagram, {
            title: "Olog diagram",
            in: model,
        });

        expect(diagram.title).toBe("Olog diagram");
        expect(diagram.theory).toBe("simple-olog");
    });

    test("cells are added over the model", async () => {
        const { binder, model, A, B, has } = await ologModel();

        const diagram = await binder.createNotebook(SimpleOlog.Diagram, {
            title: "Olog diagram",
            in: model,
        });

        diagram.add(RichText, { content: "We picture two instances of the olog." });

        const x = diagram.add(SimpleOlog.Diagram.Individual, { label: "x", over: A });
        const y = diagram.add(SimpleOlog.Diagram.Individual, { label: "y", over: B });

        expect(x.over?.label).toBe("A");
        expect(x.type.obType.content).toBe("Object");

        const f = diagram.add(SimpleOlog.Diagram.Aspect, { from: x, to: y, over: has });

        expect(f.over?.label).toBe("has");
        expect(f.from?.label).toBe("x");
        expect(f.to?.label).toBe("y");
    });
});
