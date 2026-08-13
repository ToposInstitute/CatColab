import * as Automerge from "@automerge/automerge";
import { type Doc, getBackend, getObjectId } from "@automerge/automerge";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import {
    createBinder,
    defineShape,
    type DocumentStore,
    plainStore,
    RichText,
    type RichTextRef,
} from "catcolab-documents";

function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    return getBackend(doc).materialize(objId!) as T;
}

type SolidAutomergeHandle = {
    readonly docHandle: DocHandle<Document>;
    readonly docView: Document;
};

type RichTextDocumentStore<Handle> = DocumentStore<Handle> & {
    getRichTextRef(handle: Handle, cellId: string): RichTextRef | undefined;
};

/** An Automerge-backed store with the one rich-text capability: the
 * editor-binding `getRichTextRef`. Programmatic replaces need no dedicated
 * hook — Automerge stores strings assigned inside a change function as text
 * objects, so the generic `changeDocument` path already preserves text-object
 * semantics. */
function makeAutomergeStore() {
    const repo = new Repo();
    const store: RichTextDocumentStore<SolidAutomergeHandle> = {
        createHandle: async (initialDoc) => {
            const docHandle = repo.create<Document>(initialDoc as Document);
            return {
                docHandle,
                docView: makeDocumentProjection(docHandle),
            };
        },
        getDocumentView: (handle) => handle.docView,
        changeDocument: (handle, fn) => handle.docHandle.change(fn),
        subscribe: (handle, callback) => {
            handle.docHandle.on("change", callback);
            return () => handle.docHandle.off("change", callback);
        },
        copyValue: (handle, value) => materializeFromAutomerge(handle.docHandle.doc(), value),
        getDocumentRef: (handle) => ({
            id: handle.docHandle.documentId,
            version: null,
            server: "",
        }),
        getHandle: async () => ({
            tag: "Err",
            content: [{ message: "This store cannot resolve references." }],
        }),
        getRichTextRef: (handle, cellId) => ({
            docHandle: handle.docHandle,
            path: ["notebook", "cellContents", cellId, "content"],
        }),
    };
    return store;
}

const InformalShape = defineShape({ informal: [RichText] });

describe("RichText", () => {
    test("Automerge-backed rich-text replaces go through the generic change path", async () => {
        const store = makeAutomergeStore();

        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Rich text" });
        const note = notebook.add(RichText, { content: "" });

        const [cell] = notebook.cellsOf(InformalShape);
        expect(cell).toBeDefined();
        if (!cell) {
            throw new Error("Expected informal shape to select the rich-text cell.");
        }
        expect(cell.id).toBe(note.id);

        cell.update({ content: "Replaced through the generic change path" });
        expect(note.content).toBe("Replaced through the generic change path");

        const storedCell = (notebook.handle.docHandle.doc() as Document & { type: "model" })
            .notebook.cellContents[note.id];
        expect(storedCell?.tag).toBe("rich-text");
        expect(storedCell?.content).toBe("Replaced through the generic change path");

        // The replaced field is still an Automerge text object — a string
        // assigned inside a change function is stored as text — so it stays
        // spliceable at the editor ref's path after the replace.
        const ref = note.editorRef;
        expect(ref).toBeDefined();
        const docHandle = ref!.docHandle as DocHandle<Document>;
        docHandle.change((doc) => {
            Automerge.splice(doc as Doc<unknown>, [...ref!.path], 0, 8, "Swapped");
        });
        expect(note.content).toBe("Swapped through the generic change path");
    });

    test("editorRef exposes the store-native binding for incremental edits", async () => {
        const store = makeAutomergeStore();

        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Rich text" });
        const note = notebook.add(RichText, { content: "" });

        const ref = note.editorRef;
        expect(ref).toBeDefined();
        if (!ref) {
            throw new Error("Expected the Automerge store to provide an editor ref.");
        }
        expect(ref.docHandle).toBe(notebook.handle.docHandle);
        expect(ref.path).toEqual(["notebook", "cellContents", note.id, "content"]);

        // Simulate what `@automerge/prosemirror` does with the binding: emit
        // incremental splices at the ref's path per keystroke, never routing
        // through the notebook handle or replacing the text object.
        let notifications = 0;
        const unsubscribe = store.subscribe(notebook.handle, () => {
            notifications += 1;
        });
        const docHandle = ref.docHandle as DocHandle<Document>;
        docHandle.change((doc) => {
            Automerge.splice(doc as Doc<unknown>, [...ref.path], 0, 0, "Hello");
        });
        docHandle.change((doc) => {
            Automerge.splice(doc as Doc<unknown>, [...ref.path], 5, 0, ", world");
        });
        unsubscribe();

        expect(note.content).toBe("Hello, world");
        expect(notifications).toBeGreaterThanOrEqual(1);
    });

    test("plain store falls back to replace-only rich text without an editor ref", async () => {
        const binder = createBinder(plainStore);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Plain rich text" });
        const note = notebook.add(RichText, { content: "start" });

        // The plain store defines no rich-text capability.
        expect(note.editorRef).toBeUndefined();

        note.update({ content: "replaced" });
        expect(note.content).toBe("replaced");
        const [cell] = notebook.cellsOf(InformalShape);
        expect(cell?.content).toBe("replaced");
    });
});
