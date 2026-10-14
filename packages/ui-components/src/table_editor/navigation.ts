import type { InstanceTable } from "catcolab-documents";

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

export function firstCellKey(table: InstanceTable): CellKey | null {
    const row = table.rows[0];
    const header = table.headers[0];
    return row && header ? makeCellKey(header.id, row.id) : null;
}

/** Return the adjacent cell key, or undefined at a grid boundary. */
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

/** Map arrow keys to grid directions; Tab follows browser focus order. */
export function navigationDirection(event: KeyboardEvent): MoveDirection | undefined {
    switch (event.key) {
        case "ArrowUp":
            return "up";
        case "ArrowDown":
            return "down";
        case "ArrowLeft":
            return "left";
        case "ArrowRight":
            return "right";
        default:
            return undefined;
    }
}
