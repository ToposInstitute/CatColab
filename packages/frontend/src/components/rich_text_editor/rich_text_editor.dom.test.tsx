import { next as Automerge } from "@automerge/automerge";
import { type DocHandle, type DocHandleChangePayload, Repo } from "@automerge/automerge-repo";
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, assert, describe, expect, test } from "vitest";

import { RichTextEditor } from "./rich_text_editor";

/**
 * Replicates the backend's `copy_doc_at_heads`: delete every key under root and
 * recreate the doc from a JSON snapshot.
 *
 * This mimics what `load_snapshot` (undo/redo) does to the document, including
 * the side effect that every recreated object gets a fresh ObjId.
 */
function rebuildRoot<T extends Record<string, unknown>>(handle: DocHandle<T>, snapshot: T): void {
    handle.change((doc) => {
        for (const key of Object.keys(doc)) {
            delete (doc as Record<string, unknown>)[key];
        }
        for (const [key, value] of Object.entries(snapshot)) {
            (doc as Record<string, unknown>)[key] = structuredClone(value);
        }
    });
}

type RichTextDoc = {
    notebook: {
        cellOrder: string[];
        cellContents: Record<string, { tag: "rich-text"; id: string; content: string }>;
    };
};

describe("RichTextEditor — undo/redo of rich-text cell", () => {
    const containers: HTMLElement[] = [];
    const disposers: Array<() => void> = [];

    afterEach(() => {
        for (const dispose of disposers.splice(0)) {
            try {
                dispose();
            } catch {
                // ignore
            }
        }
        for (const c of containers.splice(0)) {
            c.remove();
        }
    });

    test("does not throw RangeError when a cell is removed via redo while editor is mounted", async () => {
        const repo = new Repo({ network: [] });
        const handle: DocHandle<RichTextDoc> = repo.create<RichTextDoc>({
            notebook: { cellOrder: [], cellContents: {} },
        });
        await handle.whenReady();

        const cellId = "0190abcd-0000-7000-8000-000000000001";

        // Snapshot A: notebook contains the rich-text cell with some text.
        handle.change((doc) => {
            doc.notebook.cellOrder.push(cellId);
            doc.notebook.cellContents[cellId] = {
                tag: "rich-text",
                id: cellId,
                content: "",
            };
            Automerge.splice(
                doc,
                ["notebook", "cellContents", cellId, "content"],
                0,
                0,
                "hello world",
            );
        });
        const snapshotWithCell: RichTextDoc = structuredClone(handle.doc());

        // Snapshot B: notebook is empty (cell removed).
        handle.change((doc) => {
            delete doc.notebook.cellContents[cellId];
            doc.notebook.cellOrder = [];
        });
        const snapshotWithoutCell: RichTextDoc = structuredClone(handle.doc());

        // Currently at snapshot B; perform "undo" to A so the cell reappears
        // (with a fresh ObjId, just like the backend's load_snapshot does).
        rebuildRoot(handle, snapshotWithCell);

        // Mount the RichTextEditor against the cell, gated on the cell still
        // existing — this mirrors how the real notebook editor renders cells
        // via `<For each={cellOrder}>`, which unmounts the editor when the
        // cell disappears from the notebook.
        const container = document.createElement("div");
        document.body.appendChild(container);
        containers.push(container);

        const path = ["notebook", "cellContents", cellId, "content"];
        const [cellExists, setCellExists] = createSignal(
            handle.doc().notebook.cellOrder.includes(cellId),
        );
        const onChange = (_: DocHandleChangePayload<RichTextDoc>) => {
            setCellExists(handle.doc().notebook.cellOrder.includes(cellId));
        };
        handle.on("change", onChange);

        const dispose = render(
            () => (
                <Show when={cellExists()}>
                    <RichTextEditor handle={handle as unknown as DocHandle<unknown>} path={path} />
                </Show>
            ),
            container,
        );
        disposers.push(() => {
            handle.off("change", onChange);
            dispose();
        });

        // Wait for the editor's createEffect (which awaits `whenReady`) to mount
        // and for any microtasks to drain.
        await new Promise((r) => setTimeout(r, 50));

        // Capture any errors raised by the syncPlugin's onPatch. The error is
        // re-thrown out of the EventEmitter inside an xstate actor, so it
        // surfaces as an uncaught exception in Node — we listen on both
        // window and the process to catch either path.
        const errors: unknown[] = [];
        const onWindowError = (event: ErrorEvent) => {
            errors.push(event.error ?? event.message);
            event.preventDefault();
        };
        window.addEventListener("error", onWindowError);
        const onUncaught = (err: unknown) => errors.push(err);
        process.on("uncaughtException", onUncaught);
        process.on("unhandledRejection", onUncaught);

        try {
            // "Redo" — rebuild the doc to snapshot B (cell removed). This is
            // what triggers the RangeError in the syncPlugin today: the editor
            // is mounted on the cell, and the change event delivers patches
            // whose application leaves the cell's path no longer resolvable
            // in the resulting doc.
            try {
                rebuildRoot(handle, snapshotWithoutCell);
            } catch (e) {
                errors.push(e);
            }

            // Let listeners settle.
            await new Promise((r) => setTimeout(r, 50));
        } finally {
            window.removeEventListener("error", onWindowError);
            process.off("uncaughtException", onUncaught);
            process.off("unhandledRejection", onUncaught);
        }

        // The test fails today because syncPlugin throws synchronously inside
        // the change-event listener.
        assert.deepEqual(
            errors,
            [],
            `Expected no errors during redo, but got: ${errors
                .map((e) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)))
                .join("; ")}`,
        );

        // Sanity: after the redo the doc no longer has the cell.
        expect(handle.doc().notebook.cellOrder).toEqual([]);
    });
});
