import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Creating notebooks" and "Editing notebooks".
//
// All documents are created through a binder instance. Calling `createBinder()`
// with no arguments uses a plain in-memory store for documents. All cells are
// added with a single `add` method: `RichText` for prose, or an object/morphism
// type from the logic for formal cells.
import { createBinder, RichText } from "catcolab-documents";

describe("creating and editing notebooks", () => {
    test("createNotebook creates a titled notebook for a logic", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        expect(notebook.title).toBe("An Olog");
        expect(notebook.document.theory).toBe("simple-olog");
        expect(notebook.cells().length).toBe(0);
    });

    test("cells are added with a single `add` method", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const intro = notebook.add(RichText, { content: "We define a simple olog." });

        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        const arrow = notebook.add(Aspect, { label: "has", from: source, to: target });

        expect(intro.content).toBe("We define a simple olog.");
        expect(source.label).toBe("A");
        expect(target.label).toBe("B");
        expect(arrow.label).toBe("has");
        expect(arrow.from?.id).toBe(source.id);
        expect(arrow.to?.id).toBe(target.id);
        expect(notebook.cells().length).toBe(4);
    });

    test("cells can be added with null", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const source = notebook.add(Type, { label: null });
        const target = notebook.add(Type, { label: null });
        const arrow = notebook.add(Aspect, { label: null, from: null, to: null });

        expect(source.label).toBe("");
        expect(target.label).toBe("");
        expect(arrow.label).toBe("");
        expect(arrow.from).toBe(null);
        expect(arrow.to).toBe(null);
        expect(notebook.cells().length).toBe(3);
    });

    test("the notebook and any cell can be updated", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const intro = notebook.add(RichText, { content: "We define a simple olog." });
        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        const arrow = notebook.add(Aspect, { label: "has", from: source, to: target });

        notebook.update({ title: "A simple Olog example" });

        intro.update({
            content: "We define a simple olog with two objects and one arrow.",
        });

        source.update({
            label: "Source",
        });

        arrow.update({
            label: "has as",
            from: source,
            to: target,
        });

        expect(notebook.title).toBe("A simple Olog example");
        expect(intro.content).toBe("We define a simple olog with two objects and one arrow.");
        expect(source.label).toBe("Source");
        expect(arrow.label).toBe("has as");
        expect(arrow.from?.id).toBe(source.id);
        expect(arrow.to?.id).toBe(target.id);
    });

    test("partial updates leave the other fields intact", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        const arrow = notebook.add(Aspect, { label: "has", from: source, to: target });

        arrow.update({
            label: "has as example",
        });

        expect(arrow.label).toBe("has as example");
        expect(arrow.from?.id).toBe(source.id);
        expect(arrow.to?.id).toBe(target.id);
    });
});
