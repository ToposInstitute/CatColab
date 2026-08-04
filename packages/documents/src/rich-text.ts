import type { NotebookDocument } from "./notebook-document";

export interface RichTextCell {
    readonly kind: "rich-text";
    readonly id: string;
    readonly content: string;

    update(patch: Partial<{ content: string }>): void;
}

function richTextCell(document: NotebookDocument, cellId: string) {
    const cell = document.notebook.cellContents[cellId];
    if (!cell) {
        throw new Error(`Cell ${cellId} does not exist.`);
    }
    if (cell.tag !== "rich-text") {
        throw new Error(`Cell ${cellId} is not rich text.`);
    }
    return cell;
}

export function richTextHandle(document: NotebookDocument, cellId: string): RichTextCell {
    return {
        kind: "rich-text",
        id: cellId,
        get content() {
            return richTextCell(document, cellId).content;
        },
        update(patch) {
            if (patch.content === undefined) {
                return;
            }
            richTextCell(document, cellId).content = patch.content;
        },
    };
}
