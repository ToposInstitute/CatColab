import * as Automerge from "@automerge/automerge";
import { decodeHeads, type DocHandle, type UrlHeads } from "@automerge/automerge-repo";
import { subscribe } from "@inkandswitch/patchwork-providers";
import { type Accessor, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import type { Notebook, Uuid } from "catlog-wasm";
import type { NotebookDiff } from "../../frontend/src/notebook";

/** A document whose notebook can be diffed. */
type NotebookDoc<T> = { notebook: Notebook<T> };

/** Diff baseline served by the Patchwork draft overlay (`draft:baseline`).

`heads` is `null` when there is nothing to diff against, e.g. on "main" or
while the draft isn't showing changes. It is `null` rather than optional so
that the value is valid JSON for the provider channel.
 */
type Baseline = { heads: UrlHeads | null };

/** Diff of a notebook document against its baseline in the active draft.

Reads `undefined` while there is no baseline. Otherwise the diff is recomputed
whenever the document changes, since the baseline itself only moves when the
draft does.
 */
export function createNotebookDiff<T>(
    element: HTMLElement,
    handle: Accessor<DocHandle<NotebookDoc<T>>>,
): Accessor<NotebookDiff<T> | undefined> {
    const [baseline, setBaseline] = createSignal<UrlHeads | null>(null);
    const [version, setVersion] = createSignal(0);

    createEffect(() => {
        const docHandle = handle();
        const unsubscribe = subscribe<Baseline>(
            element,
            { type: "draft:baseline", url: docHandle.url },
            ({ heads }) => setBaseline(heads),
        );

        // Deferred so that we never recompute from inside the sync layer's
        // own `handle.change` callback.
        let scheduled = false;
        const onChange = () => {
            if (scheduled) {
                return;
            }
            scheduled = true;
            queueMicrotask(() => {
                scheduled = false;
                setVersion((v) => v + 1);
            });
        };
        docHandle.on("change", onChange);

        onCleanup(() => {
            unsubscribe();
            docHandle.off("change", onChange);
            setBaseline(null);
        });
    });

    let previous: { heads: UrlHeads; diff: NotebookDiff<T> } | undefined;

    return createMemo(() => {
        version();
        const heads = baseline();
        const doc = handle().doc();
        if (!heads || !doc) {
            previous = undefined;
            return undefined;
        }
        try {
            const before = Automerge.view(doc, decodeHeads(heads)).notebook;
            const reusable =
                previous && sameJson(previous.heads, heads) ? previous.diff : undefined;
            previous = { heads, diff: diffNotebook(before, doc.notebook, reusable) };
            return previous.diff;
        } catch (error) {
            console.warn("[catcolab] failed to compute notebook diff", error);
            previous = undefined;
            return undefined;
        }
    });
}

/** Compares two versions of a notebook cell by cell.

Cells are matched by ID, so a cell that was only moved counts as unchanged.
Deleted cells and baseline contents are reused from `previous` (a diff against
the same baseline) when unchanged, so that the notebook doesn't re-render them
on every change to the document.
 */
export function diffNotebook<T>(
    before: Notebook<T> | undefined,
    after: Notebook<T>,
    previous?: NotebookDiff<T>,
): NotebookDiff<T> {
    const beforeContents = before?.cellContents ?? {};

    const cells: NotebookDiff<T>["cells"] = new Map();
    const baseline: NotebookDiff<T>["baseline"] = new Map();
    for (const [id, cell] of Object.entries(after.cellContents)) {
        const old = beforeContents[id];
        if (!old) {
            cells.set(id, "added");
        } else if (!sameJson(old, cell)) {
            cells.set(id, "changed");
            if (old.tag === "formal") {
                const reused = previous?.baseline.get(id);
                baseline.set(
                    id,
                    reused && sameJson(reused, old.content)
                        ? reused
                        : JSON.parse(JSON.stringify(old.content)),
                );
            }
        }
    }

    const deleted: NotebookDiff<T>["deleted"] = [];
    let anchor: Uuid | null = null;
    for (const id of before?.cellOrder ?? []) {
        const cell = beforeContents[id];
        if (!cell) {
            continue;
        }
        if (id in after.cellContents) {
            anchor = id;
            continue;
        }
        const reused = previous?.deleted.find((d) => d.cell.id === id && d.after === anchor);
        deleted.push(reused ?? { cell: JSON.parse(JSON.stringify(cell)), after: anchor });
    }

    return { cells, baseline, deleted };
}

/** Structural equality of two Automerge values.

Both sides are materialized from the same document, so their keys come out in
the same order and the serializations can be compared directly.
 */
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
