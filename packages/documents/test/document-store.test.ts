import { describe, expect, test, vi } from "vitest";

import { currentVersion, type Document } from "catcolab-document-types";
import { createPlainDocumentStore } from "../src/store";

function modelDocument(title: string): Document {
    return {
        type: "model",
        name: title,
        theory: "simple-olog",
        notebook: { cellOrder: [], cellContents: {} },
        version: currentVersion(),
    };
}

describe("plain document store", () => {
    test("changeDocument mutates the stable view and notifies subscribers", async () => {
        const store = createPlainDocumentStore();
        const handle = await store.createHandle(modelDocument("Before"));
        const view = store.getDocumentView(handle);
        const callback = vi.fn<() => void>();
        const unsubscribe = store.subscribe(handle, callback);

        store.changeDocument(handle, (document) => {
            document.name = "After";
        });

        expect(store.getDocumentView(handle)).toBe(view);
        expect(view.name).toBe("After");
        expect(callback).toHaveBeenCalledOnce();

        unsubscribe();
        store.changeDocument(handle, (document) => {
            document.name = "After unsubscribe";
        });
        expect(callback).toHaveBeenCalledOnce();
    });

    test("copyValue returns detached plain data", async () => {
        const store = createPlainDocumentStore();
        const handle = await store.createHandle(modelDocument("An Olog"));
        const view = store.getDocumentView(handle);

        const copy = store.copyValue(handle, view);

        expect(copy).toEqual(view);
        expect(copy).not.toBe(view);
    });

    test("references resolve only in their originating store", async () => {
        const firstStore = createPlainDocumentStore();
        const secondStore = createPlainDocumentStore();
        const document = modelDocument("An Olog");
        const handle = await firstStore.createHandle(document);
        const secondHandle = await secondStore.createHandle(document);
        const ref = firstStore.getDocumentRef(handle);
        const secondRef = secondStore.getDocumentRef(secondHandle);

        expect(firstStore.getDocumentRef(handle)).toEqual(ref);
        expect(secondRef.id).not.toBe(ref.id);
        expect((await firstStore.getHandle(ref)).tag).toBe("Ok");
        expect((await secondStore.getHandle(ref)).tag).toBe("Err");
        expect((await secondStore.getHandle(secondRef)).tag).toBe("Ok");
        expect((await firstStore.getHandle({ ...ref, version: "old" })).tag).toBe("Err");
        expect((await firstStore.getHandle({ ...ref, server: "example.com" })).tag).toBe("Err");
    });
});
