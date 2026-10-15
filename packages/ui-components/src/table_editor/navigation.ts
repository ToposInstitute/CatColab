import type { InstanceTable } from "catcolab-documents";

export type MoveDirection = "up" | "down" | "left" | "right";

/** Identifies a cell by header and row ID, so it is stable as either are shuffled. */
export type CellKey = `${string}\u0000${string}`;

export function makeCellKey(headerId: string, rowId: string): CellKey {
    return `${headerId}\u0000${rowId}`;
}

type ParsedCellKey = { headerId: string; rowId: string };

export function parseCellKey(key: CellKey): ParsedCellKey {
    const sep = key.indexOf("\u0000");
    return { headerId: key.slice(0, sep), rowId: key.slice(sep + 1) };
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
