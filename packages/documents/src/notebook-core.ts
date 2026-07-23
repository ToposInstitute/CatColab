import { Nb } from "catcolab-document-methods";
import type {
    Document,
    Notebook as PersistedNotebook,
    NotebookCell,
} from "catcolab-document-types";
import { changeDocumentOfType, getDocumentViewOfType, type DocumentOfType } from "./document";
import type { DocumentStore } from "./store";

export interface NotebookFormat<Type extends Document["type"], Formal> {
    readonly documentType: Type;
    getNotebook(document: Readonly<DocumentOfType<Type>>): Readonly<PersistedNotebook<Formal>>;
    changeNotebook(
        document: DocumentOfType<Type>,
        change: (notebook: PersistedNotebook<Formal>) => void,
    ): void;
}

export interface NotebookCore<Formal> {
    append(cell: NotebookCell<Formal>): void;
    get(cellId: string): NotebookCell<Formal> | undefined;
    cells(): readonly NotebookCell<Formal>[];
    changeCell(cellId: string, change: (cell: NotebookCell<Formal>) => void): void;
    setDuplicateFormal(duplicate: (content: Formal) => Formal): void;
    duplicate(cellId: string): string;
    moveUp(cellId: string): void;
    moveDown(cellId: string): void;
    moveTo(cellId: string, index: number): void;
    delete(cellId: string): void;
}

export function newNotebook<Formal>(): PersistedNotebook<Formal> {
    return Nb.newNotebook<Formal>();
}

export function newRichTextCell(content: string): NotebookCell<never> {
    return Nb.newRichTextCell(content);
}

export function newFormalCell<Formal>(content: Formal): NotebookCell<Formal> {
    return Nb.newFormalCell(content);
}

export function createNotebookCore<Handle, Type extends Document["type"], Formal>(
    store: DocumentStore<Handle>,
    handle: Handle,
    format: NotebookFormat<Type, Formal>,
): NotebookCore<Formal> {
    let duplicateFormal: ((content: Formal) => Formal) | undefined;
    const getNotebook = () =>
        format.getNotebook(getDocumentViewOfType(store, handle, format.documentType));
    const changeNotebook = (change: (notebook: PersistedNotebook<Formal>) => void) => {
        changeDocumentOfType(store, handle, format.documentType, (document) => {
            format.changeNotebook(document, change);
        });
    };

    const moveTo = (cellId: string, target: number) => {
        changeNotebook((notebook) => {
            const from = notebook.cellOrder.indexOf(cellId);
            if (from < 0) {
                return;
            }
            const index = Math.max(0, Math.min(Math.trunc(target), notebook.cellOrder.length - 1));
            Nb.moveCellByIndex(notebook, from, index);
        });
    };

    return {
        append(cell) {
            changeNotebook((notebook) => {
                Nb.appendCell(notebook, cell);
            });
        },
        get(cellId) {
            return getNotebook().cellContents[cellId];
        },
        cells() {
            return Nb.getCells(getNotebook());
        },
        changeCell(cellId, change) {
            changeNotebook((notebook) => {
                const cell = notebook.cellContents[cellId];
                if (cell) {
                    change(cell);
                }
            });
        },
        setDuplicateFormal(duplicate) {
            duplicateFormal = duplicate;
        },
        duplicate(cellId) {
            const original = getNotebook().cellContents[cellId];
            if (!original) {
                throw new Error(`Cell ${cellId} does not exist.`);
            }
            const materialized = store.copyValue(handle, original) as NotebookCell<Formal>;
            let duplicate: NotebookCell<Formal>;
            if (materialized.tag === "formal") {
                if (!duplicateFormal) {
                    throw new Error("Formal cell duplication is not configured.");
                }
                duplicate = Nb.duplicateCell(materialized, duplicateFormal);
            } else {
                duplicate = Nb.newRichTextCell(materialized.content);
            }
            changeNotebook((notebook) => {
                Nb.appendCell(notebook, duplicate);
            });
            return duplicate.id;
        },
        moveUp(cellId) {
            changeNotebook((notebook) => {
                const index = notebook.cellOrder.indexOf(cellId);
                if (index >= 0) {
                    Nb.moveCellUp(notebook, index);
                }
            });
        },
        moveDown(cellId) {
            changeNotebook((notebook) => {
                const index = notebook.cellOrder.indexOf(cellId);
                if (index >= 0) {
                    Nb.moveCellDown(notebook, index);
                }
            });
        },
        moveTo,
        delete(cellId) {
            changeNotebook((notebook) => {
                const index = notebook.cellOrder.indexOf(cellId);
                if (index >= 0) {
                    Nb.deleteCellAtIndex(notebook, index);
                }
            });
        },
    };
}

const notebookCores = new WeakMap<object, NotebookCore<unknown>>();

export function registerNotebookCore<Formal>(notebook: object, core: NotebookCore<Formal>): void {
    notebookCores.set(notebook, core as NotebookCore<unknown>);
}

export function getNotebookCore<Formal>(notebook: object): NotebookCore<Formal> {
    const core = notebookCores.get(notebook);
    if (!core) {
        throw new Error("Notebook API is not attached to notebook storage.");
    }
    return core as NotebookCore<Formal>;
}
