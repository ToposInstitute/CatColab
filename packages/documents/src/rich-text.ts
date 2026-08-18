import type { RichTextContent } from "catcolab-document-types";
import type { DocumentStore } from "./document-store";
import { deleteNotebookCell, type NotebookDocument } from "./notebook-document";

export interface RichTextCell {
    readonly kind: "rich-text";
    readonly id: string;
    readonly content: RichTextContent | undefined;

    update(patch: Partial<{ content: RichTextContent }>): void;
    delete(): void;
}

function tryGetStoredRichTextCell(document: Readonly<NotebookDocument>, cellId: string) {
    const cell = document.notebook.cellContents[cellId];
    if (!cell) {
        return undefined;
    }
    if (cell.tag !== "rich-text") {
        throw new Error(`Cell ${cellId} is not rich text.`);
    }
    return cell;
}

export function getRichTextCell<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
): RichTextCell {
    return {
        kind: "rich-text",
        id: cellId,
        get content() {
            const document = store.getDocumentView(handle) as Readonly<NotebookDocument>;
            return tryGetStoredRichTextCell(document, cellId)?.content;
        },
        update(patch) {
            const content = patch.content;
            if (content === undefined) {
                return;
            }
            const document = store.getDocumentView(handle) as Readonly<NotebookDocument>;
            if (!tryGetStoredRichTextCell(document, cellId)) {
                return;
            }

            store.changeDocument(handle, (storedDocument) => {
                const cell = tryGetStoredRichTextCell(storedDocument as NotebookDocument, cellId);
                if (cell) {
                    cell.content = content;
                }
            });
        },
        delete() {
            deleteNotebookCell(store, handle, cellId);
        },
    };
}
