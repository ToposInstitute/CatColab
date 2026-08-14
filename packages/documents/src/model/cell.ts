import { Nb } from "catcolab-document-methods";
import type { Ob } from "catcolab-document-types";
import { getRichTextCell, type RichTextCell } from "../rich-text";
import { findMorphismType, findObjectType } from "../shape";
import type {
    CodomainObjectTypesOf,
    DomainObjectTypesOf,
    MorphismType,
    MorphismTypesOf,
    ObjectType,
    ObjectTypesOf,
    Shape,
} from "../shape";
import { getModelJudgment, type ModelDocument } from "./document";

export interface ObjectCell<O extends ObjectType> {
    readonly kind: "object";
    readonly id: string;
    readonly type: O;
    readonly label: string;

    update(patch: Partial<{ label: string | null }>): void;
}

export interface MorphismCell<S extends Shape, M extends MorphismType> {
    readonly kind: "morphism";
    readonly id: string;
    readonly type: M;
    readonly label: string;
    readonly from: ObjectCell<DomainObjectTypesOf<S, M>> | null;
    readonly to: ObjectCell<CodomainObjectTypesOf<S, M>> | null;

    update(
        patch: Partial<{
            label: string | null;
            from: ObjectCell<DomainObjectTypesOf<S, M>> | null;
            to: ObjectCell<CodomainObjectTypesOf<S, M>> | null;
        }>,
    ): void;
}

export type CellOf<S extends Shape> =
    | RichTextCell
    | ObjectCell<ObjectTypesOf<S>>
    | MorphismCell<S, MorphismTypesOf<S>>;

export function getObjectCell<O extends ObjectType>(
    document: ModelDocument,
    cellId: string,
    type: O,
): ObjectCell<O> {
    return {
        kind: "object",
        id: cellId,
        type,
        get label() {
            const judgment = getModelJudgment(document, cellId);
            if (judgment.tag !== "object") {
                throw new Error(`Cell ${cellId} is not an object.`);
            }
            return judgment.name;
        },
        update(patch) {
            if (patch.label === undefined) {
                return;
            }
            const judgment = getModelJudgment(document, cellId);
            if (judgment.tag !== "object") {
                throw new Error(`Cell ${cellId} is not an object.`);
            }
            judgment.name = patch.label ?? "";
        },
    };
}

function objectCellFromOb<S extends Shape>(
    shape: S,
    document: ModelDocument,
    endpoint: Ob | null,
): ObjectCell<ObjectTypesOf<S>> | null {
    if (endpoint?.tag !== "Basic") {
        return null;
    }

    for (const cellId of document.notebook.cellOrder) {
        const cell = Nb.getCellById(document.notebook, cellId);
        if (cell.tag !== "formal" || cell.content.tag !== "object") {
            continue;
        }
        if (cell.content.id === endpoint.content) {
            const type = findObjectType(shape, cell.content.obType);
            return type ? getObjectCell(document, cellId, type) : null;
        }
    }

    return null;
}

export function obFromObjectCell(
    document: ModelDocument,
    endpoint: ObjectCell<ObjectType> | null,
): Ob | null {
    if (!endpoint) {
        return null;
    }
    const judgment = getModelJudgment(document, endpoint.id);
    if (judgment.tag !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return { tag: "Basic", content: judgment.id };
}

export function getMorphismCell<S extends Shape, M extends MorphismTypesOf<S>>(
    shape: S,
    document: ModelDocument,
    cellId: string,
    type: M,
): MorphismCell<S, M> {
    return {
        kind: "morphism",
        id: cellId,
        type,
        get label() {
            const judgment = getModelJudgment(document, cellId);
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return judgment.name;
        },
        get from() {
            const judgment = getModelJudgment(document, cellId);
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return objectCellFromOb(shape, document, judgment.dom) as ObjectCell<
                DomainObjectTypesOf<S, M>
            > | null;
        },
        get to() {
            const judgment = getModelJudgment(document, cellId);
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return objectCellFromOb(shape, document, judgment.cod) as ObjectCell<
                CodomainObjectTypesOf<S, M>
            > | null;
        },
        update(patch) {
            const judgment = getModelJudgment(document, cellId);
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            const dom = Object.hasOwn(patch, "from")
                ? obFromObjectCell(document, patch.from ?? null)
                : undefined;
            const cod = Object.hasOwn(patch, "to")
                ? obFromObjectCell(document, patch.to ?? null)
                : undefined;

            if (patch.label !== undefined) {
                judgment.name = patch.label ?? "";
            }
            if (dom !== undefined) {
                judgment.dom = dom;
            }
            if (cod !== undefined) {
                judgment.cod = cod;
            }
        },
    };
}

export function getModelCell<S extends Shape>(
    shape: S,
    document: ModelDocument,
    cellId: string,
): CellOf<S> {
    const cell = Nb.getCellById(document.notebook, cellId);
    if (cell.tag === "rich-text") {
        return getRichTextCell(document, cellId);
    }

    switch (cell.content.tag) {
        case "object": {
            const type = findObjectType(shape, cell.content.obType);
            if (!type) {
                throw new Error(`Object cell ${cellId} is not supported by the notebook shape.`);
            }
            return getObjectCell(document, cellId, type);
        }
        case "morphism": {
            const type = findMorphismType(shape, cell.content.morType);
            if (!type) {
                throw new Error(`Morphism cell ${cellId} is not supported by the notebook shape.`);
            }
            return getMorphismCell(shape, document, cellId, type);
        }
        default:
            throw new Error(`Formal cell ${cellId} is not supported yet.`);
    }
}
