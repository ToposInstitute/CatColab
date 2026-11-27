import { Model, Nb } from "catcolab-document-methods";
import type { DocumentStore } from "../document-store";
import { getNotebookData, type CellData } from "./data";
import type { ModelDocument } from "./document";

/** Duplicate a notebook cell, inserting the copy after it in the cell order. */
export function duplicateNotebookCell<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): CellData | undefined {
    const data = getNotebookData(store, handle);
    if (!data.cells.some((cell) => cell.id === cellId)) {
        return undefined;
    }

    const cell = (store.getDocumentSnapshot(handle) as ModelDocument).notebook.cellContents[cellId];
    if (!cell) {
        return undefined;
    }
    const copy = Nb.duplicateCell(
        structuredClone(cell) as ModelDocument["notebook"]["cellContents"][string],
        Model.duplicateModelJudgment,
    );

    store.changeDocument(handle, (document) => {
        const notebook = (document as ModelDocument).notebook;
        if (!Array.isArray(notebook.cellOrder)) {
            return;
        }
        const index = notebook.cellOrder.indexOf(cellId);
        if (index === -1) {
            return;
        }
        Nb.insertCellAtIndex(notebook, copy, index + 1);
    });

    return getNotebookData(store, handle).cells.find((cell) => cell.id === copy.id);
}
