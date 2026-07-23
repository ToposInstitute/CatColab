import { Nb, type ModelDocument } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";

export type { ModelDocument } from "catcolab-document-methods";

export function formalJudgment(document: ModelDocument, cellId: string): ModelJudgment {
    const cell = Nb.getCellById(document.notebook, cellId);
    if (cell.tag !== "formal") {
        throw new Error(`Cell ${cellId} is not formal.`);
    }
    return cell.content;
}
