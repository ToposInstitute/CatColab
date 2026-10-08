import { createMemo, onCleanup, untrack, type Accessor } from "solid-js";

import {
    cellMatchesFilter,
    createCellReadView,
    describeModelCell,
    type DeepReadonly,
    type ModelDocument,
    type Notebook,
    type NotebookCell,
    type Shape,
} from "catcolab-documents";
import { requireOwner } from "./owner";
import { createDocumentView } from "./documents";

export type NotebookView<S extends Shape> = Pick<
    Notebook<S, ModelDocument>,
    "document" | "title" | "cells" | "cellsOf"
> & {
    cell(id: string): NotebookCell<S> | undefined;
};

/** Identity/lifecycle adapter around core reads and commands. The default source
 * reconciles snapshots; an injected projection can supply patch-backed reads.
 * Replacement/unmount retires views, never the caller's bound notebook. */
export function createNotebookView<S extends Shape, H, V>(
    source: Accessor<Notebook<S, ModelDocument, H, V>>,
    project: (
        notebook: Notebook<S, ModelDocument, H, V>,
    ) => Accessor<DeepReadonly<ModelDocument>> = (notebook) => {
        const view = createDocumentView(notebook, () => notebook.dump());
        return () => view;
    },
): Accessor<NotebookView<S>> {
    requireOwner();
    return createMemo(() => {
        const notebook = source();
        const document = project(notebook);
        type Entry = { description: ReturnType<typeof describeModelCell>; view: NotebookCell<S> };
        let cache = new Map<string, Entry>();
        let active = true;
        onCleanup(() => {
            active = false;
            cache.clear();
        });
        const cells = createMemo(() => {
            const descriptions = document().notebook.cellOrder.map(
                (id) => [id, describeModelCell(notebook.shape, document(), id)] as const,
            );
            const cores = untrack(() => notebook.cells());
            const next = new Map<string, Entry>();
            const result = descriptions.map(([id, description], index) => {
                let entry = cache.get(id);
                if (
                    !entry ||
                    entry.description?.kind !== description?.kind ||
                    entry.description?.type !== description?.type
                ) {
                    const fresh: Entry = { description, view: cores[index]! };
                    fresh.view = createCellReadView<NotebookCell<S>>(
                        cores[index]!,
                        () => {
                            cells();
                            return active && cache.get(id) === fresh ? document() : undefined;
                        },
                        cell,
                        untrack,
                    );
                    entry = fresh;
                }
                next.set(id, entry);
                return entry.view;
            });
            cache = next;
            return result;
        });
        function cell(id: string) {
            cells();
            return cache.get(id)?.view;
        }
        return {
            get document() {
                return document();
            },
            get title() {
                return document().name;
            },
            cells,
            cell,
            cellsOf(filter) {
                return cells().filter((cell) => cellMatchesFilter(cell, filter));
            },
        };
    });
}
