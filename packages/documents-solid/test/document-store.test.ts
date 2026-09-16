import { SimpleOlog } from "catcolab-logics/simple-olog";
import { createEffect, createRoot } from "solid-js";
import { unwrap } from "solid-js/store";
import { describe, expect, test } from "vitest";

import { createBinder, createInMemoryStore } from "catcolab-documents";
import { createSolidDocumentStore } from "../src";

describe("Solid document store", () => {
    test("projects document changes reactively", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const notebook = await createBinder(store).createNotebook(SimpleOlog, { title: "Before" });
        const titles: string[] = [];
        const dispose = createRoot((dispose) => {
            createEffect(() => titles.push(notebook.title));
            return dispose;
        });

        notebook.update({ title: "After" });

        expect(titles).toEqual(["Before", "After"]);
        dispose();
        store.dispose();
    });

    test("keeps snapshots and copies outside the Solid projection", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const notebook = await createBinder(store).createNotebook(SimpleOlog, {
            title: "Notebook",
        });
        const view = store.getDocumentView(notebook.handle);
        const snapshot = store.getDocumentSnapshot?.(notebook.handle);
        const copy = store.copyValue(notebook.handle, view);

        expect(snapshot).not.toBe(view);
        expect(copy).not.toBe(view);
        expect(copy).not.toBe(unwrap(view));
        expect(copy).toEqual(unwrap(view));
        store.dispose();
    });

    test("keeps draft projections isolated", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const notebook = await createBinder(store).createNotebook(SimpleOlog, {
            title: "Original",
        });
        const draft = store.createDraft(notebook.handle);
        const draftView = store.getDocumentView(draft);

        store.changeDocument(draft, (document) => {
            document.name = "Draft";
        });
        expect(draftView.name).toBe("Draft");
        expect(notebook.title).toBe("Original");

        store.discardDraft(draft);
        store.dispose();
    });
});
