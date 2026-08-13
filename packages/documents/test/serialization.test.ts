import { PetriNet } from "catcolab-logics/petri-net";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

// RFC-0006 "Serialization": dumping a notebook, loading it back, shape
// mismatches, and loading from a `DocumentRef`.
import { createBinder } from "catcolab-documents";

describe("serialization", () => {
    test("a dumped notebook can be loaded", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(PetriNet, { title: "Example Petri-net" });

        const petriNetData = notebook.dump();

        const loaded = await binder.loadNotebook(PetriNet, petriNetData);
        expect(loaded.tag).toBe("Ok");
        if (loaded.tag !== "Ok") {
            return;
        }
        expect(loaded.content.title).toBe("Example Petri-net");
    });

    test("loading a document with the wrong shape yields an Err describing the mismatch", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(PetriNet, { title: "Example Petri-net" });

        const petriNetData = notebook.dump();

        const wrong = await binder.loadNotebook(SimpleOlog, petriNetData);
        expect(wrong.tag).toBe("Err");
        if (wrong.tag !== "Err") {
            return;
        }
        expect(wrong.content.map((issue) => issue.message).join("; ")).toBe(
            'Cannot load document with theory "petri-net" using a shape with theory "simple-olog".',
        );
    });

    test("loadNotebookFromRef returns an Err when the store cannot resolve the reference", async () => {
        const binder = createBinder();

        const loaded = await binder.loadNotebookFromRef(PetriNet, {
            id: "some-document-id",
            version: null,
        });

        expect(loaded.tag).toBe("Err");
    });
});
