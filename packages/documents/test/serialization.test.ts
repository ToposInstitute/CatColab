import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Serialization": dumping a notebook, loading it back, shape
// mismatches, and loading from a `DocumentRef`.
import { createBinder, defineShape } from "catcolab-documents";

const OtherOlog = defineShape({
    theory: "other-olog",
    objects: [Type],
    morphisms: [Aspect],
});

describe("serialization", () => {
    test("a dumped notebook can be loaded", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const ologData = notebook.dump();

        const loaded = await binder.loadNotebook(SimpleOlog, ologData);
        expect(loaded.tag).toBe("Ok");
        if (loaded.tag !== "Ok") {
            return;
        }
        expect(loaded.content.title).toBe("An Olog");
    });

    test("loading a document with the wrong shape yields an Err describing the mismatch", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const ologData = notebook.dump();

        const wrong = await binder.loadNotebook(OtherOlog, ologData);
        expect(wrong.tag).toBe("Err");
        if (wrong.tag !== "Err") {
            return;
        }
        expect(wrong.content.map((issue) => issue.message).join("; ")).toBe(
            'Cannot load document with theory "simple-olog" using a shape with theory "other-olog".',
        );
    });

    test("loadNotebookFromRef returns an Err when the store cannot resolve the reference", async () => {
        const binder = createBinder();

        const loaded = await binder.loadNotebookFromRef(SimpleOlog, {
            id: "some-document-id",
            version: null,
        });

        expect(loaded.tag).toBe("Err");
    });
});
