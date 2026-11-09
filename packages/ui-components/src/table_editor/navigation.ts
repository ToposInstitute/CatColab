import type { InstanceTable } from "catcolab-documents";

export type MoveDirection = "up" | "down" | "left" | "right";

/** Identifies a cell by header and row ID, so it is stable as either are shuffled. */
export type CellKey = `${string}\u0000${string}`;

export function makeCellKey(headerId: string | null, rowId: string): CellKey {
    return headerId === null ? `label\u0000${rowId}` : `field\u0000${headerId}\u0000${rowId}`;
}

type ParsedCellKey = { headerId: string | null; rowId: string };

export function parseCellKey(key: CellKey): ParsedCellKey {
    if (key.startsWith("label\u0000")) {
        return { headerId: null, rowId: key.slice(6) };
    }
    const sep = key.indexOf("\u0000", 6);
    return { headerId: key.slice(6, sep), rowId: key.slice(sep + 1) };
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
    let colIndex = headerId === null ? -1 : headerIndex.get(headerId);
    if (rowIndex < 0 || colIndex === undefined) {
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
    if (!row || colIndex < -1) {
        return undefined;
    }
    return colIndex === -1
        ? makeCellKey(null, row.id)
        : header
          ? makeCellKey(header.id, row.id)
          : undefined;
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
