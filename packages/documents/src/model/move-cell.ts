import { Nb } from "catcolab-document-methods";
import type { DocumentStore } from "../document-store";
import type { ModelDocument } from "./document";

/** Move a notebook cell one position up, a no-op when it cannot move. */
export function moveNotebookCellUp<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): void {
    moveCell(store, handle, cellId, Nb.moveCellUp);
}

/** Move a notebook cell one position down, a no-op when it cannot move. */
export function moveNotebookCellDown<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): void {
    moveCell(store, handle, cellId, Nb.moveCellDown);
}

/** Move a notebook cell to an index in its notebook's cell order, clamped to the ends. */
export function moveNotebookCellTo<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
    index: number,
): void {
    moveCell(store, handle, cellId, (notebook, from) => {
        Nb.moveCellByIndex(
            notebook,
            from,
            Math.max(0, Math.min(index, notebook.cellOrder.length - 1)),
        );
    });
}

function moveCell<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
    move: (notebook: ModelDocument["notebook"], index: number) => void,
): void {
    store.changeDocument(handle, (document) => {
        const notebook = (document as ModelDocument).notebook;
        if (!Array.isArray(notebook.cellOrder)) {
            return;
        }
        const index = notebook.cellOrder.indexOf(cellId);
        if (index === -1) {
            return;
        }
        move(notebook, index);
    });
}
