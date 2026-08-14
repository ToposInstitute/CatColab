import { Nb } from "catcolab-document-methods";
import type { Ob } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import { deleteNotebookCell } from "../notebook-document";
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
import { tryGetModelJudgment, type ModelDocument } from "./document";

/** Runtime names for the discriminants on notebook cell handles. */
export const CellKind = {
    RichText: "rich-text" satisfies RichTextCell["kind"],
    Object: "object" satisfies ObjectCell<ObjectType>["kind"],
    Morphism: "morphism" satisfies MorphismCell<Shape, MorphismType>["kind"],
} as const;

export interface ObjectCell<O extends ObjectType> {
    readonly kind: "object";
    readonly id: string;
    readonly type: O;
    readonly label: string | undefined;

    update(patch: Partial<{ label: string | null }>): void;
    delete(): void;
}

export interface MorphismCell<S extends Shape, M extends MorphismType> {
    readonly kind: "morphism";
    readonly id: string;
    readonly type: M;
    readonly label: string | undefined;
    readonly from: ObjectCell<DomainObjectTypesOf<S, M>> | null | undefined;
    readonly to: ObjectCell<CodomainObjectTypesOf<S, M>> | null | undefined;

    update(
        patch: Partial<{
            label: string | null;
            from: ObjectCell<DomainObjectTypesOf<S, M>> | null;
            to: ObjectCell<CodomainObjectTypesOf<S, M>> | null;
        }>,
    ): void;
    delete(): void;
}

export type CellOf<S extends Shape> =
    | RichTextCell
    | ObjectCell<ObjectTypesOf<S>>
    | MorphismCell<S, MorphismTypesOf<S>>;

export function getObjectCell<Handle, O extends ObjectType>(
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
    type: O,
    onFormalChange: () => void,
): ObjectCell<O> {
    return {
        kind: "object",
        id: cellId,
        type,
        get label() {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            const judgment = tryGetModelJudgment(document, cellId);
            if (!judgment) {
                return undefined;
            }
            if (judgment.tag !== "object") {
                throw new Error(`Cell ${cellId} is not an object.`);
            }
            return judgment.name;
        },
        update(patch) {
            if (patch.label === undefined) {
                return;
            }
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            if (!tryGetModelJudgment(document, cellId)) {
                return;
            }

            let updated = false;
            store.changeDocument(handle, (storedDocument) => {
                const judgment = tryGetModelJudgment(storedDocument as ModelDocument, cellId);
                if (!judgment) {
                    return;
                }
                if (judgment.tag !== "object") {
                    throw new Error(`Cell ${cellId} is not an object.`);
                }
                judgment.name = patch.label ?? "";
                updated = true;
            });
            if (updated) {
                onFormalChange();
            }
        },
        delete() {
            if (deleteNotebookCell(store, handle, cellId)) {
                onFormalChange();
            }
        },
    };
}

function objectCellFromOb<Handle, S extends Shape>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
    endpoint: Ob | null,
    onFormalChange: () => void,
): ObjectCell<ObjectTypesOf<S>> | null {
    const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
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
            return type ? getObjectCell(store, handle, cellId, type, onFormalChange) : null;
        }
    }

    return null;
}

export function obFromObjectCell(
    document: Readonly<ModelDocument>,
    endpoint: ObjectCell<ObjectType> | null,
): Ob | null {
    if (!endpoint) {
        return null;
    }
    const judgment = tryGetModelJudgment(document, endpoint.id);
    if (!judgment) {
        throw new Error(`Cell ${endpoint.id} does not exist.`);
    }
    if (judgment.tag !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return { tag: "Basic", content: judgment.id };
}

export function getMorphismCell<Handle, S extends Shape, M extends MorphismTypesOf<S>>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
    type: M,
    onFormalChange: () => void,
): MorphismCell<S, M> {
    return {
        kind: "morphism",
        id: cellId,
        type,
        get label() {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            const judgment = tryGetModelJudgment(document, cellId);
            if (!judgment) {
                return undefined;
            }
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return judgment.name;
        },
        get from() {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            const judgment = tryGetModelJudgment(document, cellId);
            if (!judgment) {
                return undefined;
            }
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return objectCellFromOb(
                shape,
                store,
                handle,
                judgment.dom,
                onFormalChange,
            ) as ObjectCell<DomainObjectTypesOf<S, M>> | null;
        },
        get to() {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            const judgment = tryGetModelJudgment(document, cellId);
            if (!judgment) {
                return undefined;
            }
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return objectCellFromOb(
                shape,
                store,
                handle,
                judgment.cod,
                onFormalChange,
            ) as ObjectCell<CodomainObjectTypesOf<S, M>> | null;
        },
        update(patch) {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            if (!tryGetModelJudgment(document, cellId)) {
                return;
            }

            let updated = false;
            store.changeDocument(handle, (storedDocument) => {
                const modelDocument = storedDocument as ModelDocument;
                const judgment = tryGetModelJudgment(modelDocument, cellId);
                if (!judgment) {
                    return;
                }
                if (judgment.tag !== "morphism") {
                    throw new Error(`Cell ${cellId} is not a morphism.`);
                }

                const dom = Object.hasOwn(patch, "from")
                    ? obFromObjectCell(modelDocument, patch.from ?? null)
                    : undefined;
                const cod = Object.hasOwn(patch, "to")
                    ? obFromObjectCell(modelDocument, patch.to ?? null)
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
                updated = true;
            });
            if (updated) {
                onFormalChange();
            }
        },
        delete() {
            if (deleteNotebookCell(store, handle, cellId)) {
                onFormalChange();
            }
        },
    };
}

export function getModelCell<Handle, S extends Shape>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
    onFormalChange: () => void,
): CellOf<S> {
    const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
    const cell = Nb.getCellById(document.notebook, cellId);
    if (cell.tag === "rich-text") {
        return getRichTextCell(store, handle, cellId);
    }

    switch (cell.content.tag) {
        case "object": {
            const type = findObjectType(shape, cell.content.obType);
            if (!type) {
                throw new Error(`Object cell ${cellId} is not supported by the notebook shape.`);
            }
            return getObjectCell(store, handle, cellId, type, onFormalChange);
        }
        case "morphism": {
            const type = findMorphismType(shape, cell.content.morType);
            if (!type) {
                throw new Error(`Morphism cell ${cellId} is not supported by the notebook shape.`);
            }
            return getMorphismCell(shape, store, handle, cellId, type, onFormalChange);
        }
        default:
            throw new Error(`Formal cell ${cellId} is not supported yet.`);
    }
}
