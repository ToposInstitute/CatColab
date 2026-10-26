import type { DocumentStore } from "../document-store";
import type { ModelDocument } from "./document";
import type { NotebookDocument } from "./notebook-document";
import { parseModelNotebookStructure } from "./parse-structure";

/** Delete a notebook cell by ID, returning whether the cell existed. */
export function deleteNotebookCell<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): boolean {
    const document = store.getDocumentSnapshot(handle);
    const { value } = parseModelNotebookStructure(document as ModelDocument);
    if (!Object.hasOwn(value.notebook.cellContents, cellId)) {
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
