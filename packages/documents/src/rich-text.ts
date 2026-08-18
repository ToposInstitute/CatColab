import type { RichTextContent } from "catcolab-document-types";
import type { DocumentStore } from "./document-store";
import type { NotebookDocument } from "./notebook-document";

export interface RichTextCell {
    readonly kind: "rich-text";
    readonly id: string;
    readonly content: RichTextContent;

    update(patch: Partial<{ content: RichTextContent }>): void;
}

function getStoredRichTextCell(document: Readonly<NotebookDocument>, cellId: string) {
    const cell = document.notebook.cellContents[cellId];
    if (!cell) {
        throw new Error(`Cell ${cellId} does not exist.`);
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
            return getStoredRichTextCell(document, cellId).content;
        },
        update(patch) {
            const content = patch.content;
            if (content === undefined) {
                return;
            }
            store.changeDocument(handle, (document) => {
                getStoredRichTextCell(document as NotebookDocument, cellId).content = content;
            });
        },
    };
}
