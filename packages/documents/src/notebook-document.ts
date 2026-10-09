import type { Document } from "catcolab-document-types";
import type { DocumentStore } from "./document-store";
import { isRecord } from "./parsed-document";

/** A document whose primary content is a notebook. */
export type NotebookDocument = Extract<Document, { type: "model" | "diagram" | "analysis" }>;

/** Delete a notebook cell by ID, returning whether the cell existed. */
export function deleteNotebookCell<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): boolean {
    const document = store.getDocumentSnapshot(handle).document as Readonly<NotebookDocument>;
    const current = document.notebook;
    if (
        !isRecord(current) ||
        !isRecord(current.cellContents) ||
        !Object.hasOwn(current.cellContents, cellId)
    ) {
        return false;
    }

    let deleted = false;
    store.changeDocument(handle, (storedDocument) => {
        const notebook = (storedDocument as NotebookDocument).notebook;
        delete notebook.cellContents[cellId];
        // The parsed read view may expose an unordered cell. Delete its contents
        // regardless of order damage, and remove every occurrence of this ID.
        if (Array.isArray(notebook.cellOrder)) {
            for (let index = notebook.cellOrder.length - 1; index >= 0; index -= 1) {
                if (notebook.cellOrder[index] === cellId) {
                    notebook.cellOrder.splice(index, 1);
                }
            }
        }
        deleted = true;
    });
    return deleted;
}
