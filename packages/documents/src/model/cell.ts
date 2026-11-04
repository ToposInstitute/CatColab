import type { Ob } from "catcolab-document-types";
import type { CellData, ModelNotebookData } from "./data";
import type { CellRef } from "./update";

/** Runtime names for the discriminants on notebook cells. */
export const CellKind = {
    RichText: "rich-text",
    Object: "object",
    Morphism: "morphism",
    PathEquation: "path-equation",
} as const satisfies Record<string, CellData["kind"]>;

export function obFromObjectCell(data: ModelNotebookData, endpoint: CellRef | null): Ob | null {
    if (!endpoint) {
        return null;
    }
    const cell = data.cells.find((cell) => cell.id === endpoint.id);
    if (!cell) {
        throw new Error(`Cell ${endpoint.id} does not exist.`);
    }
    if (cell.kind !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return { tag: "Basic", content: cell.generatorId };
}
