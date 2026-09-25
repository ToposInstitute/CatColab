import { SimpleOlog } from "catcolab-logics/simple-olog";
import { createEffect, createRoot } from "solid-js";
import { unwrap } from "solid-js/store";
import { describe, expect, test } from "vitest";

import { createBinder, createInMemoryStore } from "catcolab-documents";
import { createSolidDocumentStore } from "../src";

describe("Solid document store", () => {
    test("projects changes and isolates drafts", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const notebook = await createBinder(store).createNotebook(SimpleOlog, { title: "Before" });
        const titles: string[] = [];
        const dispose = createRoot((dispose) => {
            createEffect(() => titles.push(notebook.title));
            return dispose;
        });
        notebook.update({ title: "After" });
        expect(titles).toEqual(["Before", "After"]);

        const view = store.getDocumentView(notebook.handle);
        expect(store.getDocumentSnapshot?.(notebook.handle)).toEqual(unwrap(view));
        expect(store.copyValue(notebook.handle, view)).not.toBe(view);
        const draft = store.createDraft(notebook.handle);
        store.changeDocument(draft, (document) => {
            document.name = "Draft";
        });
        expect(store.getDocumentView(draft).name).toBe("Draft");
        expect(notebook.title).toBe("After");
        store.discardDraft(draft);
        dispose();
        store.dispose();
    });
});
