import type { Document, ModelJudgment, NotebookCell } from "catcolab-document-types";

export type ModelDocument = Extract<Document, { type: "model" }>;

export function persistedCell(
    document: ModelDocument,
    cellId: string,
): NotebookCell<ModelJudgment> {
    const cell = document.notebook.cellContents[cellId];
    if (!cell) {
        throw new Error(`Cell ${cellId} does not exist.`);
    }
    return cell;
}

export function formalJudgment(document: ModelDocument, cellId: string): ModelJudgment {
    const cell = persistedCell(document, cellId);
    if (cell.tag !== "formal") {
        throw new Error(`Cell ${cellId} is not formal.`);
    }
    return cell.content;
}

export function appendCell(document: ModelDocument, cell: NotebookCell<ModelJudgment>): void {
    document.notebook.cellOrder.push(cell.id);
    document.notebook.cellContents[cell.id] = cell;
}
