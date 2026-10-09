import type { RichTextContent } from "catcolab-document-types";
import type { DeepReadonly, DocumentStore } from "./document-store";
import { createCellReadView } from "./model/cell-reads";
import { parseModelSnapshot } from "./model/parsed-source";
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

export function getRichTextCell<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): RichTextCell {
    return createCellReadView<RichTextCell>(
        {
            kind: "rich-text",
            id: cellId,
            update(patch) {
                const content = patch.content;
                if (content === undefined) {
                    return;
                }
                const document = store.getDocumentSnapshot(handle)
                    .document as Readonly<NotebookDocument>;
                if (!tryGetStoredRichTextCell(document, cellId)) {
                    return;
                }

                store.changeDocument(handle, (storedDocument) => {
                    const cell = tryGetStoredRichTextCell(
                        storedDocument as NotebookDocument,
                        cellId,
                    );
                    if (cell) {
                        cell.content = content;
                    }
                });
            },
            delete() {
                deleteNotebookCell(store, handle, cellId);
            },
        },
        () => {
            const snapshot = store.getDocumentSnapshot(handle);
            const document = snapshot.document as DeepReadonly<NotebookDocument>;
            if (document.type !== "model") {
                return document;
            }
            const parsed = parseModelSnapshot(snapshot);
            return parsed.tag === "Ok" ? parsed.content.value : undefined;
        },
    );
}
