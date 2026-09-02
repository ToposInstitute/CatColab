import type { Mor } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import { findMorphismType } from "../shape";
import type { MorphismType, MorphismTypesOf, Shape } from "../shape";
import { getMorphismCell, obFromObjectCell, objectCellFromOb, type MorphismCell } from "./cell";
import { tryGetModelJudgment, type ModelDocument } from "./document";
import type { EquationSide } from "./equation";

/** Converts an equation side into its stored form, dropping null morphisms. */
export function morFromSide<S extends Shape>(
    document: Readonly<ModelDocument>,
    side: EquationSide<S>,
): Mor | null {
    if ("kind" in side) {
        const ob = obFromObjectCell(document, side)!;
        return { tag: "Composite", content: { tag: "Id", content: ob } };
    }
    const mors: Mor[] = [];
    for (const cell of side) {
        if (cell !== null) {
            mors.push(morFromMorphismCell(document, cell));
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

/** Converts a stored equation side into its public view. */
export function sideFromMor<Handle, S extends Shape, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    side: Mor | null,
): EquationSide<S> {
    if (side === null) {
        return [];
    }
    if (side.tag === "Composite" && side.content.tag === "Id") {
        const object = objectCellFromOb(shape, store, handle, side.content.content);
        if (object === null) {
            return [null];
        }
        return object;
    }
    let mors: Mor[];
    if (side.tag === "Composite" && side.content.tag === "Seq") {
        mors = side.content.content;
    } else {
        mors = [side];
    }
    return mors.map((mor) => {
        if (mor.tag !== "Basic") {
            return null;
        }
        return morphismCellFromBasicMor(shape, store, handle, mor.content);
    });
}

function morphismCellFromBasicMor<Handle, S extends Shape, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    morId: string,
): MorphismCell<S, MorphismTypesOf<S>> | null {
    const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
    for (const cellId of document.notebook.cellOrder) {
        const cell = document.notebook.cellContents[cellId];
        if (cell?.tag !== "formal" || cell.content.tag !== "morphism") {
            continue;
        }
        if (cell.content.id === morId) {
            const type = findMorphismType(shape, cell.content.morType);
            return type ? getMorphismCell(shape, store, handle, cellId, type) : null;
        }
    }
    return null;
}

function morFromMorphismCell(
    document: Readonly<ModelDocument>,
    endpoint: MorphismCell<Shape, MorphismType>,
): Mor {
    const judgment = tryGetModelJudgment(document, endpoint.id);
    if (!judgment) {
        throw new Error(`Cell ${endpoint.id} does not exist.`);
    }
    if (judgment.tag !== "morphism") {
        throw new Error(`Cell ${endpoint.id} is not a morphism.`);
    }
    return { tag: "Basic", content: judgment.id };
}
