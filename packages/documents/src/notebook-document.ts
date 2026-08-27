import type { Document } from "catcolab-document-types";
import type { DocumentStore } from "./document-store";

/** A document whose primary content is a notebook. */
export type NotebookDocument = Extract<Document, { type: "model" | "diagram" | "analysis" }>;

/** Delete a notebook cell by ID, returning whether the cell existed. */
export function deleteNotebookCell<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): boolean {
    const document = store.getDocumentView(handle) as Readonly<NotebookDocument>;
    const currentIndex = document.notebook.cellOrder.indexOf(cellId);
    if (currentIndex < 0) {
        return false;
    }

    let deleted = false;
    store.changeDocument(handle, (storedDocument) => {
        const notebook = (storedDocument as NotebookDocument).notebook;
        const index = notebook.cellOrder.indexOf(cellId);
        if (index < 0) {
            return;
        }
        delete notebook.cellContents[cellId];
        notebook.cellOrder.splice(index, 1);
        deleted = true;
    });
    return deleted;
}
