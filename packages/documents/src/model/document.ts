import type { ModelDocument } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";

export type { ModelDocument } from "catcolab-document-methods";

export function tryGetModelJudgment(
    document: Readonly<ModelDocument>,
    cellId: string,
): ModelJudgment | undefined {
    const cell = document.notebook.cellContents[cellId];
    if (!cell) {
        return undefined;
    }
    if (cell.tag !== "formal") {
        throw new Error(`Cell ${cellId} is not formal.`);
    }
    return cell.content;
}
