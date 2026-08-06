// A realistic frontend integration for rich-text cells: the exact wiring of
// the frontend's `RichTextEditor` (packages/frontend/src/components/
// rich_text_editor/rich_text_editor.tsx), but sourcing the Automerge binding
// from `cell.editorRef` instead of hand-threading `handle` + `path` props
// through the notebook UI (as notebook_editor.tsx:382 / notebook_cell.tsx:308
// do today).
//
// The frontend's rich-text data flow is *not* "mutate through a change
// function": ProseMirror is bound directly to the Automerge document by
// `@automerge/prosemirror`'s sync plugin, which emits per-keystroke splices on
// the text object and applies remote patches back into the editor. The store
// abstraction supports that with `getRichTextRef`, which hands the editor the
// store's `DocHandle` plus the path to the cell's text object. This file shows
// the three flows a frontend needs:
//
//   1. Typing in the editor lands in the document, readable reactively through
//      the notebook handle (`cell.content`).
//   2. A collaborator's incremental edit (a splice arriving on the same
//      `DocHandle`) flows back into the live editor through the sync plugin.
//   3. A coarse programmatic replace (`cell.update({ content })`, routed
//      through the generic `changeDocument`) structurally replaces the text
//      object; the editor detects that — the frontend's
//      `hasStructuralReplacement` reinit path (rich_text_editor.tsx:283, 517)
//      — and reinitializes.
/* oxlint-disable unicorn/consistent-function-scoping */
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
import { createEffect, createSignal, onCleanup } from "solid-js";
import { For, render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import {
    createBinder,
    defineShape,
    type DocumentStore,
    RichText,
    type RichTextCell,
} from "catcolab-documents";

function materializeFromAutomerge<T>(doc: Doc<unknown>, subtree: T): T {
    const objId = getObjectId(subtree as object);
    return getBackend(doc).materialize(objId!) as T;
}

// ---------------------------------------------------------------------------
// The store: Solid + Automerge, as the frontend would implement it. The one
// rich-text capability is the point of this file:
//
//   * `getRichTextRef` — the editor binding. It returns the `DocHandle` the
//     handle wraps plus the path to the cell's text object, exactly the pair
//     the frontend's `RichTextEditor` takes as props today.
//
// Programmatic replaces (`cell.update({ content })`, for non-editor writes
// like imports or automation) need no dedicated hook: they route through the
// generic `changeDocument`, and Automerge stores a string assigned inside a
// change function as a text object, so the field stays a text object.
// ---------------------------------------------------------------------------
type StoreHandle = {
    readonly docHandle: DocHandle<Document>;
    readonly docView: Document;
};

function makeFrontendStore(): DocumentStore<StoreHandle> {
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
}

// ---------------------------------------------------------------------------
// The editor component: the frontend's `RichTextEditor` reduced to its
// Automerge wiring (no menus, math, or keymaps). Line-for-line correspondence
// with packages/frontend/src/components/rich_text_editor/rich_text_editor.tsx:
//
//   * `init(docHandle, path, { schemaAdapter })` — schema.ts:39. The frontend
//     passes its custom `SchemaAdapter`; the stock `basicSchemaAdapter` is
//     used here.
//   * `EditorState.create` with the returned plugin + `new EditorView` —
//     rich_text_editor.tsx:162-189. The sync plugin owns both directions:
//     local transactions become Automerge splices, remote patches become
//     editor transactions.
//   * structural-replacement detection + reinit — rich_text_editor.tsx:283,
//     500-521. `@automerge/prosemirror` skips `put`/`del` patches at the text
//     path, so a whole-object replacement must reinitialize the editor.
//
// The one difference from today's frontend: the component takes the notebook's
// `RichTextCell` handle and reads `cell.editorRef`, instead of receiving
// `handle` and `path` threaded down as props.
// ---------------------------------------------------------------------------

/** True when `candidate` is a prefix of (or equal to) `target`. */
function isPathPrefixOf(candidate: Prop[], target: readonly Prop[]): boolean {
    if (candidate.length > target.length) {
        return false;
    }
    for (let i = 0; i < candidate.length; i++) {
        if (candidate[i] !== target[i]) {
            return false;
        }
    }
    return true;
}

/** Detect patches that replace the text object (or an ancestor) wholesale. */
function hasStructuralReplacement(patches: Patch[], textPath: readonly Prop[]): boolean {
    return patches.some(
        (p) => (p.action === "put" || p.action === "del") && isPathPrefixOf(p.path, textPath),
    );
}

function RichTextCellEditor(props: {
    cell: RichTextCell;
    /** Hands the live view out so the test can type into it. */
    onView: (view: EditorView) => void;
}) {
    let editorRoot!: HTMLDivElement;
    const [reinitTrigger, setReinitTrigger] = createSignal(0);

    createEffect(() => {
        void reinitTrigger();

        // The whole point: the binding comes off the cell handle. A store that
        // cannot bind an editor yields `undefined`, and a real component would
        // fall back to a read-only rendering with replace-style updates.
        const ref = props.cell.editorRef;
        if (!ref) {
            return;
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
                if (view.isDestroyed) {
                    return;
                }
                view.updateState(view.state.apply(tx));
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

const InformalShape = defineShape({ informal: [RichText] });

describe("frontend rich-text editor over the future notebook API", () => {
    test("typing, collaboration, and programmatic replace through cell.editorRef", async () => {
        const store = makeFrontendStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Notes" });
        const note = notebook.add(RichText, { content: "" });

        // Render the notebook's rich-text cells the way notebook_editor.tsx
        // does, except each editor binds itself through `cell.editorRef`.
        let view: EditorView | undefined;
        const container = document.createElement("div");
        document.body.appendChild(container);
        const dispose = render(
            () => (
                <For each={notebook.cellsOf(InformalShape)}>
                    {(cell) => <RichTextCellEditor cell={cell} onView={(v) => (view = v)} />}
                </For>
            ),
            container,
        );
        expect(view).toBeDefined();

        // 1. Typing: a ProseMirror transaction (what every keystroke becomes)
        // is turned into Automerge splices by the sync plugin, and surfaces
        // reactively on the notebook handle — no notebook-side code involved.
        view!.dispatch(view!.state.tr.insertText("Hello from ProseMirror"));
        expect(note.content).toBe("Hello from ProseMirror");
        expect(container.textContent).toContain("Hello from ProseMirror");

        // 2. Collaboration: a remote splice arrives on the same `DocHandle`
        // (that is what sync delivers). The plugin patches the live editor.
        const ref = note.editorRef;
        expect(ref).toBeDefined();
        const docHandle = ref!.docHandle as DocHandle<Document>;
        docHandle.change((doc) => {
            Automerge.splice(doc as Doc<unknown>, [...ref!.path], 0, 5, "Howdy");
        });
        expect(note.content).toBe("Howdy from ProseMirror");
        expect(view!.state.doc.textContent).toBe("Howdy from ProseMirror");

        // 3. Programmatic replace: `cell.update` routes through the generic
        // `changeDocument`, and assigning a string inside an Automerge change
        // function structurally replaces the text object (a `put` patch). The
        // sync plugin skips such patches, so the component's reinit path (the
        // frontend's `hasStructuralReplacement`) rebuilds the editor around
        // the new text object.
        const staleView = view;
        note.update({ content: "Replaced programmatically" });
        expect(note.content).toBe("Replaced programmatically");
        expect(view).not.toBe(staleView); // the editor reinitialized
        expect(staleView?.isDestroyed).toBe(true);
        expect(view!.state.doc.textContent).toBe("Replaced programmatically");

        // ...and the reinitialized editor is still live for further typing.
        view!.dispatch(view!.state.tr.insertText(" and edited", view!.state.doc.content.size - 1));
        expect(note.content).toBe("Replaced programmatically and edited");

        dispose();
        container.remove();
    });
});
