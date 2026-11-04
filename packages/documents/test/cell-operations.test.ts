import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Further details on notebook editing": duplicating, re-ordering and
// deleting cells, getting a cell by id, and subscribing to changes.
import { createBinder, RichText } from "catcolab-documents";

async function threeObjectNotebook() {
    const binder = createBinder();
    const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

    const a = notebook.add(Type, { label: "A" });
    const b = notebook.add(Type, { label: "B" });
    const c = notebook.add(Type, { label: "C" });

    function names() {
        return notebook
            .cellsOf(Type)
            .map((cell) => cell.label)
            .join(", ");
    }

    return { notebook, a, b, c, names };
}

describe.skip("duplicating cells", () => {
    test("copies keep the shape, get fresh identities and update independently", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const a = notebook.add(Type, { label: "A" });
        const b = a.duplicate();
        b.update({
            label: `B (copy of ${a.label})`,
        });

        expect(a.label).toBe("A");
        expect(b.label).toBe("B (copy of A)");
        expect(b.id).not.toBe(a.id);
        expect(notebook.cellsOf(Type).length).toBe(2);
    });
});

describe.skip("re-ordering cells", () => {
    test("moveUp and moveDown shift a cell one position; moveTo moves to an index", async () => {
        const { a, b, c, names } = await threeObjectNotebook();

        c.moveUp();
        expect(names()).toBe("A, C, B");

        a.moveDown();
        expect(names()).toBe("C, A, B");

        b.moveTo(0);
        expect(names()).toBe("B, C, A");
    });

    test("impossible moves are silent no-ops and out-of-range targets clamp", async () => {
        const { a, b, c, names } = await threeObjectNotebook();

        a.moveUp();
        c.moveDown();
        expect(names()).toBe("A, B, C");

        b.moveTo(99);
        expect(names()).toBe("A, C, B");
    });
});

describe("deleting cells", () => {
    test("deleting a cell removes it from the notebook's order and contents", async () => {
        const { notebook, b, names } = await threeObjectNotebook();

        expect(names()).toBe("A, B, C");
        notebook.delete(b);
        expect(names()).toBe("A, C");
        expect(notebook.dump().notebook.cellContents[b.id]).toBeUndefined();
    });

    test("rich-text cells can be deleted in the same way", async () => {
        const { notebook } = await threeObjectNotebook();

        const note = notebook.add(RichText, { content: "A note." });
        expect(notebook.cells().length).toBe(4);
        notebook.delete(note);
        expect(notebook.cells().length).toBe(3);
    });

    test("after deletion, the stale data is unchanged and no longer in the notebook", async () => {
        const { notebook, b } = await threeObjectNotebook();

        notebook.delete(b);
        expect(b.label).toBe("B");
        expect(notebook.cells().find((cell) => cell.id === b.id)).toBeUndefined();
    });

    test("deleting an already-deleted cell is a silent no-op", async () => {
        const { notebook, b, names } = await threeObjectNotebook();

        notebook.delete(b);
        notebook.delete(b);
        expect(names()).toBe("A, C");
    });
});

describe.skip("getting a cell by id", () => {
    test("get retrieves a cell by id, filtered by the type of cell", async () => {
        const { notebook, a } = await threeObjectNotebook();

        const retrievedA = notebook.get(Type, a.id);
        expect(retrievedA.tag).toBe("Ok");
        if (retrievedA.tag !== "Ok") {
            return;
        }
        expect(retrievedA.content.label).toBe("A");
    });
});

describe.skip("subscribing to changes", () => {
    test("onChange triggers on any change to the notebook, with no arguments", async () => {
        const { notebook, a } = await threeObjectNotebook();

        const calls: unknown[][] = [];
        const unsubscribe = notebook.onChange((...args: unknown[]) => {
            calls.push(args);
        });

        a.update({ label: "A2" });
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0]).toEqual([]);

        const before = calls.length;
        notebook.add(Type, { label: "D" });
        expect(calls.length).toBeGreaterThan(before);

        unsubscribe();
        const afterUnsubscribe = calls.length;
        notebook.add(Type, { label: "E" });
        expect(calls.length).toBe(afterUnsubscribe);
    });
});
