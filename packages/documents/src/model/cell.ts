import type { Ob } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import { deleteNotebookCell } from "../notebook-document";
import { getRichTextCell, type RichTextCell } from "../rich-text";
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
import { parseModelSnapshot } from "./parsed-source";

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
        () => {
            const parsed = parseModelSnapshot(store.getDocumentSnapshot(handle));
            return parsed.tag === "Ok" ? parsed.content.value : undefined;
        },
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
        () => {
            const parsed = parseModelSnapshot(store.getDocumentSnapshot(handle));
            return parsed.tag === "Ok" ? parsed.content.value : undefined;
        },
        (id) => tryGetModelCell(shape, store, handle, id),
    );
}

export function getModelCell<Handle, S extends Shape, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): CellOf<S> {
    const cell = tryGetModelCell(shape, store, handle, cellId);
    if (!cell) {
        throw new Error(`Cell ${cellId} is missing or is not supported by the notebook shape.`);
    }
    return cell;
}

/** Resolve only cells representable by this shape; malformed cells were already
 * removed by parsing. Semantic validation still sees unsupported judgments. */
export function tryGetModelCell<Handle, S extends Shape, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): CellOf<S> | undefined {
    const parsed = parseModelSnapshot(store.getDocumentSnapshot(handle));
    if (parsed.tag === "Err") {
        return undefined;
    }
    const description = describeModelCell(shape, parsed.content.value, cellId);
    if (!description) {
        return undefined;
    }
    switch (description.kind) {
        case "rich-text":
            return getRichTextCell(store, handle, cellId);
        case "object":
            return getObjectCell(store, handle, cellId, description.type);
        case "morphism":
            return getMorphismCell(shape, store, handle, cellId, description.type);
        case "path-equation":
            return getEquationCell(shape, store, handle, cellId);
    }
}
