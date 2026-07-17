// RFC-0006 "Rich text handling".
//
// Rich text is special: editor components bypass the notebook interface to
// work with ProseMirror and the Automerge plugin for ProseMirror. A store
// defines `getRichTextRef`, which adds an `editorRef` field to `RichText`
// cells that the editor component makes use of.
import * as Automerge from "@automerge/automerge";
import { type Doc, getBackend, getObjectId, type Patch } from "@automerge/automerge";
import {
    type DocHandle,
    type DocHandleChangePayload,
    type Prop,
    Repo,
} from "@automerge/automerge-repo";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import { basicSchemaAdapter, init } from "@automerge/prosemirror";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createEffect, createSignal, For, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import {
    createBinder,
    defineShape,
    type DocumentStore,
    RichText,
    type RichTextCell,
} from "catcolab-documents";

type StoreHandle = {
    readonly docHandle: DocHandle<Document>;
    readonly docView: Document;
};

function makeAutomergeRichTextStore(): DocumentStore<StoreHandle> {
    const repo = new Repo();
    return {
        createHandle: async (initialDoc) => {
            const docHandle = repo.create<Document>(initialDoc as Document);
            return { docHandle, docView: makeDocumentProjection(docHandle) };
        },
        getDocumentView: (handle) => handle.docView,
        changeDocument: (handle, fn) => handle.docHandle.change(fn),
        subscribe: (handle, callback) => {
            handle.docHandle.on("change", callback);
            return () => handle.docHandle.off("change", callback);
        },
        copyValue: (handle, value) => {
            const objId = getObjectId(value as object);
            if (objId === null) {
                throw new Error("value is not part of the document");
            }
            return getBackend(handle.docHandle.doc()).materialize(objId) as typeof value;
        },
        getDocumentRef: (handle) => ({
            id: handle.docHandle.documentId,
            version: null,
            server: "",
        }),
        getHandle: async () => ({
            tag: "Err",
            content: [{ message: "This store cannot resolve references." }],
        }),
        // This is needed for the RichTextCellEditor to bypass the notebook interface.
        getRichTextRef: (handle, cellId) => ({
            docHandle: handle.docHandle,
            path: ["notebook", "cellContents", cellId, "content"],
        }),
    };
}

function isPathPrefixOf(candidate: Prop[], target: readonly Prop[]) {
    return (
        candidate.length <= target.length &&
        candidate.every((part, index) => part === target[index])
    );
}

function hasStructuralReplacement(patches: Patch[], textPath: readonly Prop[]) {
    return patches.some(
        (patch) =>
            (patch.action === "put" || patch.action === "del") &&
            isPathPrefixOf(patch.path, textPath),
    );
}

function RichTextCellEditor(props: { cell: RichTextCell; onView: (view: EditorView) => void }) {
    let editorRoot!: HTMLDivElement;
    const [reinitTrigger, setReinitTrigger] = createSignal(0);

    createEffect(() => {
        void reinitTrigger();

        // The editorRef is exposed on the cell.
        const ref = props.cell.editorRef;
        if (!ref) {
            throw new Error("RichTextCellEditor: cell has no editorRef");
        }

        const docHandle = ref.docHandle as DocHandle<unknown>;
        const path = [...ref.path];
        const { schema, pmDoc, plugin } = init(docHandle, path, {
            schemaAdapter: basicSchemaAdapter,
        });
        const state = EditorState.create({ schema, plugins: [plugin], doc: pmDoc });
        const view: EditorView = new EditorView(editorRoot, {
            state,
            dispatchTransaction: (tx) => {
                if (!view.isDestroyed) {
                    view.updateState(view.state.apply(tx));
                }
            },
        });

        const onRemoteChange = (payload: DocHandleChangePayload<unknown>) => {
            if (hasStructuralReplacement(payload.patches, path)) {
                setReinitTrigger((n) => n + 1);
            }
        };

        docHandle.on("change", onRemoteChange);
        props.onView(view);
        onCleanup(() => {
            docHandle.off("change", onRemoteChange);
            view.destroy();
        });
    });

    return <div class="rich-text-cell" ref={editorRoot} />;
}

describe.skip("rich text handling", () => {
    test("editorRef lets ProseMirror edit rich text cells through Automerge", async () => {
        const InformalShape = defineShape({ informal: [RichText] });

        const store = makeAutomergeRichTextStore();
        const frontendBinder = createBinder(store);
        const notebook = await frontendBinder.createNotebook(SimpleOlog, { title: "Notes" });
        const note = notebook.add(RichText, { content: "" });

        let view: EditorView | undefined;
        const container = document.createElement("div");
        document.body.appendChild(container);
        const dispose = render(
            () => (
                <For each={notebook.cellsOf(InformalShape)}>
                    {(cell) => (
                        <RichTextCellEditor cell={cell} onView={(nextView) => (view = nextView)} />
                    )}
                </For>
            ),
            container,
        );

        if (!view) {
            throw new Error("Expected the editor view to be created.");
        }
        view.dispatch(view.state.tr.insertText("Hello from ProseMirror"));
        expect(note.content).toBe("Hello from ProseMirror");

        const ref = note.editorRef;
        if (!ref) {
            throw new Error("Expected the note to expose an editorRef.");
        }
        const docHandle = ref.docHandle as DocHandle<Document>;
        docHandle.change((doc) => {
            Automerge.splice(doc as Doc<unknown>, [...ref.path], 0, 5, "Howdy");
        });
        expect(view.state.doc.textContent).toBe("Howdy from ProseMirror");

        const staleView = view;
        note.update({ content: "Replaced programmatically" });
        expect(view).not.toBe(staleView);
        expect(staleView?.isDestroyed).toBe(true);
        expect(view.state.doc.textContent).toBe("Replaced programmatically");

        dispose();
        container.remove();
    });
});
