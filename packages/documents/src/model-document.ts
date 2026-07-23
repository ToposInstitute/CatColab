import { Nb, type ModelDocument } from "catcolab-document-methods";
import type { ModelJudgment, NotebookCell } from "catcolab-document-types";
import type { DocumentStore } from "./store";

export type { ModelDocument } from "catcolab-document-methods";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

export type ModelDocumentView = DeepReadonly<ModelDocument>;

export function modelDocumentView<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
): ModelDocument {
    const document = store.getDocumentView(handle);
    if (document.type !== "model") {
        throw new Error(`Expected a model document, received "${document.type}".`);
    }
    return document as ModelDocument;
}

export function changeModelDocument<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    change: (document: ModelDocument) => void,
): void {
    store.changeDocument(handle, (document) => {
        if (document.type !== "model") {
            throw new Error(`Expected a model document, received "${document.type}".`);
        }
        change(document);
    });
}

export function persistedCell(
    document: ModelDocument,
    cellId: string,
): NotebookCell<ModelJudgment> {
    return Nb.getCellById(document.notebook, cellId);
}

export function optionalPersistedCell(
    document: ModelDocument,
    cellId: string,
): NotebookCell<ModelJudgment> | undefined {
    return document.notebook.cellContents[cellId];
}

export function formalJudgment(document: ModelDocument, cellId: string): ModelJudgment {
    const cell = Nb.getCellById(document.notebook, cellId);
    if (cell.tag !== "formal") {
        throw new Error(`Cell ${cellId} is not formal.`);
    }
    return cell.content;
}
