import invariant from "tiny-invariant";
import { v7 } from "uuid";

import type { Cell, Notebook, NotebookCell } from "catlog-wasm";

/** Creates an empty notebook. */
export const newNotebook = <T>(): Notebook<T> => ({
    cellOrder: [],
    cellContents: {},
});

/** A cell containing rich text. */
export type RichTextCell = Cell<unknown> & { tag: "rich-text" };

/** Creates a rich text cell with the given content. */
export const newRichTextCell = (content?: string): RichTextCell => ({
    tag: "rich-text",
    id: v7(),
    content: content ?? "",
});

/** A cell containing custom data, usually a formal object. */
export type FormalCell<T> = Cell<T> & { tag: "formal" };

/** Creates a formal cell with the given content. */
export const newFormalCell = <T>(content: T): FormalCell<T> => ({
    tag: "formal",
    id: v7(),
    content: content,
});

/** A stem cell is a placeholder which will be converted into another cell.

Stem cells are created when the user opens the "new cell" menu and are destroyed
and replaced when a type for the new cell is selected.
 */
export type StemCell = Cell<unknown> & { tag: "stem" };

/** Creates a new stem cell. */
export const newStemCell = (): StemCell => ({
    tag: "stem",
    id: v7(),
});

export namespace NotebookUtils {
    export function getCellById<T>(notebook: Notebook<T>, cellId: string): NotebookCell<T> {
        const cell = notebook.cellContents[cellId];
        invariant(cell, () => `Failed to find notebook cell contents for cell '${cellId}'`);

        return cell;
    }

    export function getCellIdByIndex<T>(notebook: Notebook<T>, index: number): string {
        const cellId = notebook.cellOrder[index];
        invariant(cellId, () => `Failed to find notebook cell id at index '${index}'`);
        return cellId;
    }

    export function getCellByIndex<T>(notebook: Notebook<T>, index: number): NotebookCell<T> {
        const cellId = getCellIdByIndex(notebook, index);
        return getCellById(notebook, cellId);
    }

    export function insertCellAtIndex<T>(notebook: Notebook<T>, cell: Cell<T>, index: number) {
        notebook.cellOrder.splice(index, 0, cell.id);
        notebook.cellContents[cell.id] = cell;
    }

    export function newStemCellAtIndex<T>(notebook: Notebook<T>, index: number) {
        const newCell = newStemCell();
        insertCellAtIndex(notebook, newCell, index);
    }

    export function deleteCellAtIndex<T>(notebook: Notebook<T>, index: number) {
        const cellId = getCellIdByIndex(notebook, index);
        delete notebook.cellContents[cellId];
        notebook.cellOrder.splice(index, 1);
    }

    export function moveCellUp<T>(notebook: Notebook<T>, index: number) {
        if (index <= 0) {
            return;
        }

        const [cellIdToMoveUp] = notebook.cellOrder.splice(index, 1);
        invariant(cellIdToMoveUp, () => `Failed to remove cellId at index '${index}'`);
        notebook.cellOrder.splice(index - 1, 0, cellIdToMoveUp);
    }

    export function moveCellDown<T>(notebook: Notebook<T>, index: number) {
        if (index >= notebook.cellOrder.length - 1) {
            return;
        }

        const [cellIdToMoveUp] = notebook.cellOrder.splice(index, 1);
        invariant(cellIdToMoveUp, () => `Failed to remove cellId at index '${index}'`);
        notebook.cellOrder.splice(index + 1, 0, cellIdToMoveUp);
    }

    export function hasFormalCells<T>(notebook: Notebook<T>): boolean {
        return notebook.cellOrder.some((cellId) => notebook.cellContents[cellId]?.tag === "formal");
    }

    export function numCells<T>(notebook: Notebook<T>): number {
        return notebook.cellOrder.length;
    }

    export function mutateCellContentById<T>(
        notebook: Notebook<T>,
        cellId: string,
        mutator: (cellContent: T) => void,
    ) {
        const cell = getCellById(notebook, cellId);
        invariant(
            cell.tag === "formal",
            () =>
                `Only formal cells may be mutated. cell.id: '${cell.id}', cell.tag: '${cell.tag}'`,
        );
        mutator(cell.content);
    }
}
