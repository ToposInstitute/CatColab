import type { Mor } from "catcolab-document-types";
import { obFromObjectCell } from "./cell";
import type { EquationSideData, ModelNotebookData } from "./data";
import type { CellRef } from "./update";

/** Converts an equation side into its stored form, dropping null morphisms. */
export function morFromSide(data: ModelNotebookData, side: EquationSideData): Mor | null {
    if ("kind" in side) {
        const ob = obFromObjectCell(data, side)!;
        return { tag: "Composite", content: { tag: "Id", content: ob } };
    }
    const mors: Mor[] = [];
    for (const cell of side) {
        if (cell !== null) {
            mors.push(morFromMorphismCell(data, cell));
        }
    }
    const [first, ...rest] = mors;
    if (first === undefined) {
        return null;
    }
    if (rest.length === 0) {
        return first;
    }
    return { tag: "Composite", content: { tag: "Seq", content: [first, ...rest] } };
}

function morFromMorphismCell(data: ModelNotebookData, endpoint: CellRef): Mor {
    const cell = data.cells.find((cell) => cell.id === endpoint.id);
    if (!cell) {
        throw new Error(`Cell ${endpoint.id} does not exist.`);
    }
    if (cell.kind !== "morphism") {
        throw new Error(`Cell ${endpoint.id} is not a morphism.`);
    }
    return { tag: "Basic", content: cell.generatorId };
}
