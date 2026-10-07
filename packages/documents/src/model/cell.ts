import { Nb } from "catcolab-document-methods";
import type { Ob } from "catcolab-document-types";
import type { DeepReadonly, DocumentStore } from "../document-store";
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
import { createCellReadView, describeModelCell } from "./cell-reads";
import { tryGetModelJudgment, type ModelDocument } from "./document";
import { getEquationCell, type EquationCell } from "./equation";

/** Runtime names for the discriminants on notebook cell handles. */
export const CellKind = {
    RichText: "rich-text" satisfies RichTextCell["kind"],
    Object: "object" satisfies ObjectCell<ObjectType>["kind"],
    Morphism: "morphism" satisfies MorphismCell["kind"],
    PathEquation: "path-equation" satisfies EquationCell["kind"],
} as const;

export interface ObjectCell<O extends ObjectType> {
    readonly kind: "object";
    readonly id: string;
    readonly type: O;
    readonly label: string | undefined;

    update(patch: Partial<{ label: string | null }>): void;
    delete(): void;
}

export interface MorphismCell<S extends Shape = Shape, M extends MorphismType = MorphismType> {
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

export type CellOf<S extends Shape = Shape> =
    | RichTextCell
    | ObjectCell<ObjectTypesOf<S>>
    | MorphismCell<S, MorphismTypesOf<S>>
    | EquationCell<S>;

export function getObjectCell<Handle, O extends ObjectType, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
    type: O,
): ObjectCell<O> {
    return createCellReadView<ObjectCell<O>>(
        {
            kind: "object",
            id: cellId,
            type,
            update(patch) {
                if (patch.label === undefined) {
                    return;
                }
                const document = store.getDocumentSnapshot(handle)
                    .document as Readonly<ModelDocument>;
                if (!tryGetModelJudgment(document, cellId)) {
                    return;
                }

                store.changeDocument(handle, (storedDocument) => {
                    const judgment = tryGetModelJudgment(storedDocument as ModelDocument, cellId);
                    if (!judgment) {
                        return;
                    }
                    if (judgment.tag !== "object") {
                        throw new Error(`Cell ${cellId} is not an object.`);
                    }
                    judgment.name = patch.label ?? "";
                });
            },
            delete() {
                deleteNotebookCell(store, handle, cellId);
            },
        },
        () => store.getDocumentSnapshot(handle).document as DeepReadonly<ModelDocument>,
    );
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

export function getMorphismCell<Handle, S extends Shape, M extends MorphismTypesOf<S>, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
    type: M,
): MorphismCell<S, M> {
    return createCellReadView<MorphismCell<S, M>>(
        {
            kind: "morphism",
            id: cellId,
            type,
            update(patch) {
                const document = store.getDocumentSnapshot(handle)
                    .document as Readonly<ModelDocument>;
                if (!tryGetModelJudgment(document, cellId)) {
                    return;
                }

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
                });
            },
            delete() {
                deleteNotebookCell(store, handle, cellId);
            },
        },
        () => store.getDocumentSnapshot(handle).document as DeepReadonly<ModelDocument>,
        (id) =>
            describeModelCell(
                shape,
                store.getDocumentSnapshot(handle).document as DeepReadonly<ModelDocument>,
                id,
            )
                ? getModelCell(shape, store, handle, id)
                : undefined,
    );
}

export function getModelCell<Handle, S extends Shape, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): CellOf<S> {
    const document = store.getDocumentSnapshot(handle).document as Readonly<ModelDocument>;
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
            return getObjectCell(store, handle, cellId, type);
        }
        case "morphism": {
            const type = findMorphismType(shape, cell.content.morType);
            if (!type) {
                throw new Error(`Morphism cell ${cellId} is not supported by the notebook shape.`);
            }
            return getMorphismCell(shape, store, handle, cellId, type);
        }
        case "equation":
            return getEquationCell(shape, store, handle, cellId);
        default:
            throw new Error(`Formal cell ${cellId} is not supported yet.`);
    }
}
