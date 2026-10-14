import { createEffect, createMemo } from "solid-js";

import type { InstanceTable } from "catcolab-documents";
import { type FocusHandle, useChildFocus } from "../util/focus";

/** Direction to move the selection. */
export type MoveDirection = "up" | "down" | "left" | "right" | "forward" | "backward";

/** Identifies a cell by header and row ID, so it is stable as either are shuffled. */
export type CellKey = `${string}\u0000${string}`;

export function makeCellKey(headerId: string, rowId: string): CellKey {
    return `${headerId}\u0000${rowId}`;
}

export function parseCellKey(key: CellKey): { headerId: string; rowId: string } {
    const sep = key.indexOf("\u0000");
    return { headerId: key.slice(0, sep), rowId: key.slice(sep + 1) };
}

/** The key of the first cell of a table, if it has both a row and a column. */
export function firstCellKey(table: InstanceTable): CellKey | null {
    const row = table.rows[0];
    const header = table.headers[0];
    return row && header ? makeCellKey(header.id, row.id) : null;
}

/** The key of the cell adjacent to the given cell, or `undefined` at the edge
of the grid.

This is the only place that reasons about the order of rows and columns.
 */
export function neighborKey(
    table: InstanceTable,
    headerIndex: ReadonlyMap<string, number>,
    key: CellKey,
    dir: MoveDirection,
): CellKey | undefined {
    const { headerId, rowId } = parseCellKey(key);
    let rowIndex = table.rows.findIndex((row) => row.id === rowId);
    let colIndex = headerIndex.get(headerId) ?? -1;
    if (rowIndex < 0 || colIndex < 0) {
        return undefined;
    }
    if (dir === "up") {
        rowIndex -= 1;
    } else if (dir === "down") {
        rowIndex += 1;
    } else if (dir === "left") {
        colIndex -= 1;
    } else if (dir === "right") {
        colIndex += 1;
    } else if (dir === "forward") {
        colIndex += 1;
        if (colIndex >= table.headers.length) {
            rowIndex += 1;
            colIndex = 0;
        }
    } else {
        colIndex -= 1;
        if (colIndex < 0) {
            rowIndex -= 1;
            colIndex = table.headers.length - 1;
        }
    }
    const row = table.rows[rowIndex];
    const header = table.headers[colIndex];
    return row && header ? makeCellKey(header.id, row.id) : undefined;
}

/** Selection state for the grid: which cell is active and how to move it.

The selection is tracked by cell key in the focus tree, so keyboard focus and
selection stay in sync.
 */
export function createSelectionController(config: {
    /** Focus state of the whole table, from the parent focus tree. */
    focus: FocusHandle;
    table: () => InstanceTable;
}) {
    const focus = useChildFocus<CellKey>(config.focus);

    const headerIndex = createMemo(
        () => new Map(config.table().headers.map((header, index) => [header.id, index] as const)),
    );

    // No active child means no cell is selected yet: default to the first cell
    // as soon as the table gains focus.
    createEffect(() => {
        if (!config.focus.hasFocus() || focus.activeChild() !== null) {
            return;
        }
        const key = firstCellKey(config.table());
        if (key) {
            focus.childFocus(key).setFocused(true);
        }
    });

    /** The selected cell, or `null` while the table lacks focus. */
    const selectedKey = (): CellKey | null => focus.activeChild();

    /** The cell a keyboard event should act on: the selection, or the first cell. */
    const targetKey = (): CellKey | null => selectedKey() ?? firstCellKey(config.table());

    const select = (key: CellKey) => focus.childFocus(key).setFocused(true);

    /** Move the selection, staying put at the edge of the grid. */
    const move = (from: CellKey, dir: MoveDirection) => {
        const next = neighborKey(config.table(), headerIndex(), from, dir);
        if (next) {
            select(next);
        }
    };

    return { table: config.table, selectedKey, targetKey, select, move, headerIndex };
}

export type SelectionController = ReturnType<typeof createSelectionController>;

/** Shared keyboard handling for a focused cell.

Returns without preventing default for unhandled keys, including Tab at the
boundary of the grid, where focus should move out of the table.
 */
export function onCellKeyDown(selection: SelectionController, key: CellKey, evt: KeyboardEvent) {
    if (evt.defaultPrevented) {
        return;
    }
    if (evt.key === "ArrowUp") {
        selection.move(key, "up");
    } else if (evt.key === "ArrowDown") {
        selection.move(key, "down");
    } else if (evt.key === "ArrowLeft") {
        selection.move(key, "left");
    } else if (evt.key === "ArrowRight") {
        selection.move(key, "right");
    } else if (evt.key === "Tab") {
        const next = neighborKey(
            selection.table(),
            selection.headerIndex(),
            key,
            evt.shiftKey ? "backward" : "forward",
        );
        if (!next) {
            return;
        }
        selection.select(next);
    } else {
        return;
    }
    evt.preventDefault();
}
