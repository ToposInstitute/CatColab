import { Nb } from "catcolab-document-methods";
import { v7 } from "uuid";

import type {
    Link,
    ModelJudgment,
    NotebookCell,
    Ob,
    SpecializeModel,
} from "catcolab-document-types";
import { changeModelDocument, getModelDocumentView } from "./model-document";
import { findMorphismType, findObjectType } from "./shape";
import type {
    EndpointObjectTypes,
    MorphismType,
    MorphismTypes,
    ObjectType,
    ObjectTypes,
    Shape,
} from "./shape";
import type { DocumentStore } from "./store";

interface CellOperations<C> {
    duplicate(): C;
    moveUp(): void;
    moveDown(): void;
    moveTo(index: number): void;
    delete(): void;
}

export interface RichTextCell extends CellOperations<RichTextCell> {
    readonly kind: "rich-text";
    readonly id: string;
    readonly content: string | undefined;
    update(patch: Partial<{ content: string }>): void;
}

export interface ObjectCell<T extends ObjectType> extends CellOperations<ObjectCell<T>> {
    readonly kind: "object";
    readonly id: string;
    readonly type: T;
    readonly label: string | undefined;
    update(patch: Partial<{ label: string | null }>): void;
}

export interface MorphismCell<S extends Shape, T extends MorphismType> extends CellOperations<
    MorphismCell<S, T>
> {
    readonly kind: "morphism";
    readonly id: string;
    readonly type: T;
    readonly label: string | undefined;
    readonly from: ObjectCell<EndpointObjectTypes<S, T>> | null;
    readonly to: ObjectCell<EndpointObjectTypes<S, T>> | null;
    update(
        patch: Partial<{
            label: string | null;
            from: ObjectCell<EndpointObjectTypes<S, T>> | null;
            to: ObjectCell<EndpointObjectTypes<S, T>> | null;
        }>,
    ): void;
}

export interface InstantiationCell extends CellOperations<InstantiationCell> {
    readonly kind: "instantiation";
    readonly id: string;
    readonly label: string | undefined;
    readonly model: Link | null;
    readonly specializations: readonly SpecializeModel[];
}

export type Cell<S extends Shape> =
    | RichTextCell
    | ObjectCell<ObjectTypes<S>>
    | MorphismCell<S, MorphismTypes<S>>
    | InstantiationCell;

function cellView<Handle>(store: DocumentStore<Handle>, handle: Handle, cellId: string) {
    return getModelDocumentView(store, handle).notebook.cellContents[cellId];
}

function operations<Handle, C>(
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
    make: (id: string) => C,
) {
    const moveTo = (target: number) => {
        changeModelDocument(store, handle, (document) => {
            const order = document.notebook.cellOrder;
            const from = order.indexOf(cellId);
            if (from < 0) {
                return;
            }
            order.splice(from, 1);
            const index = Math.max(0, Math.min(Math.trunc(target), order.length));
            order.splice(index, 0, cellId);
        });
    };

    return {
        duplicate(): C {
            const original = cellView(store, handle, cellId);
            if (!original) {
                throw new Error(`Cell ${cellId} does not exist.`);
            }
            const duplicate = store.copyValue(handle, original) as NotebookCell<ModelJudgment>;
            const duplicateId = v7();
            duplicate.id = duplicateId;
            if (duplicate.tag === "formal") {
                duplicate.content.id = v7();
            }
            changeModelDocument(store, handle, (document) => {
                document.notebook.cellContents[duplicateId] = duplicate;
                document.notebook.cellOrder.push(duplicateId);
            });
            return make(duplicateId);
        },
        moveUp() {
            const index = getModelDocumentView(store, handle).notebook.cellOrder.indexOf(cellId);
            if (index > 0) {
                moveTo(index - 1);
            }
        },
        moveDown() {
            const document = getModelDocumentView(store, handle);
            const index = document.notebook.cellOrder.indexOf(cellId);
            if (index >= 0 && index < document.notebook.cellOrder.length - 1) {
                moveTo(index + 1);
            }
        },
        moveTo,
        delete() {
            changeModelDocument(store, handle, (document) => {
                const index = document.notebook.cellOrder.indexOf(cellId);
                if (index >= 0) {
                    document.notebook.cellOrder.splice(index, 1);
                }
                delete document.notebook.cellContents[cellId];
            });
        },
    };
}

export function richTextHandle<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
): RichTextCell {
    const make = (id: string) => richTextHandle(store, handle, id);
    return {
        kind: "rich-text",
        id: cellId,
        get content() {
            const cell = cellView(store, handle, cellId);
            return cell?.tag === "rich-text" ? cell.content : undefined;
        },
        update(patch) {
            if (patch.content === undefined) {
                return;
            }
            changeModelDocument(store, handle, (document) => {
                const cell = document.notebook.cellContents[cellId];
                if (cell?.tag === "rich-text") {
                    cell.content = patch.content as string;
                }
            });
        },
        ...operations(store, handle, cellId, make),
    };
}

export function objectHandle<Handle, T extends ObjectType>(
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
    type: T,
): ObjectCell<T> {
    const make = (id: string) => objectHandle(store, handle, id, type);
    return {
        kind: "object",
        id: cellId,
        type,
        get label() {
            const cell = cellView(store, handle, cellId);
            return cell?.tag === "formal" && cell.content.tag === "object"
                ? cell.content.name
                : undefined;
        },
        update(patch) {
            if (patch.label === undefined) {
                return;
            }
            changeModelDocument(store, handle, (document) => {
                const cell = document.notebook.cellContents[cellId];
                if (cell?.tag === "formal" && cell.content.tag === "object") {
                    cell.content.name = patch.label ?? "";
                }
            });
        },
        ...operations(store, handle, cellId, make),
    };
}

function endpointHandle<Handle, S extends Shape>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
    endpoint: Ob | null,
): ObjectCell<ObjectTypes<S>> | null {
    if (endpoint?.tag !== "Basic") {
        return null;
    }
    const document = getModelDocumentView(store, handle);
    for (const cellId of document.notebook.cellOrder) {
        const cell = Nb.getCellById(document.notebook, cellId);
        if (
            cell.tag === "formal" &&
            cell.content.tag === "object" &&
            cell.content.id === endpoint.content
        ) {
            const type = findObjectType(shape, cell.content.obType);
            return type ? objectHandle(store, handle, cellId, type) : null;
        }
    }
    return null;
}

export function endpointValue<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    endpoint: ObjectCell<ObjectType> | null,
): Ob | null {
    if (!endpoint) {
        return null;
    }
    const cell = cellView(store, handle, endpoint.id);
    if (cell?.tag !== "formal" || cell.content.tag !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return { tag: "Basic", content: cell.content.id };
}

export function objectGeneratorId<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    endpoint: ObjectCell<ObjectType>,
): string {
    const cell = cellView(store, handle, endpoint.id);
    if (cell?.tag !== "formal" || cell.content.tag !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return cell.content.id;
}

export function morphismHandle<Handle, S extends Shape, T extends MorphismTypes<S>>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
    type: T,
): MorphismCell<S, T> {
    const make = (id: string) => morphismHandle(shape, store, handle, id, type);
    return {
        kind: "morphism",
        id: cellId,
        type,
        get label() {
            const cell = cellView(store, handle, cellId);
            return cell?.tag === "formal" && cell.content.tag === "morphism"
                ? cell.content.name
                : undefined;
        },
        get from() {
            const cell = cellView(store, handle, cellId);
            const endpoint =
                cell?.tag === "formal" && cell.content.tag === "morphism" ? cell.content.dom : null;
            return endpointHandle(shape, store, handle, endpoint) as ObjectCell<
                EndpointObjectTypes<S, T>
            > | null;
        },
        get to() {
            const cell = cellView(store, handle, cellId);
            const endpoint =
                cell?.tag === "formal" && cell.content.tag === "morphism" ? cell.content.cod : null;
            return endpointHandle(shape, store, handle, endpoint) as ObjectCell<
                EndpointObjectTypes<S, T>
            > | null;
        },
        update(patch) {
            const dom = Object.hasOwn(patch, "from")
                ? endpointValue(store, handle, patch.from ?? null)
                : undefined;
            const cod = Object.hasOwn(patch, "to")
                ? endpointValue(store, handle, patch.to ?? null)
                : undefined;
            changeModelDocument(store, handle, (document) => {
                const cell = document.notebook.cellContents[cellId];
                if (cell?.tag !== "formal" || cell.content.tag !== "morphism") {
                    return;
                }
                if (patch.label !== undefined) {
                    cell.content.name = patch.label ?? "";
                }
                if (dom !== undefined) {
                    cell.content.dom = dom;
                }
                if (cod !== undefined) {
                    cell.content.cod = cod;
                }
            });
        },
        ...operations(store, handle, cellId, make),
    };
}

export function instantiationHandle<Handle>(
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
): InstantiationCell {
    const make = (id: string) => instantiationHandle(store, handle, id);
    return {
        kind: "instantiation",
        id: cellId,
        get label() {
            const cell = cellView(store, handle, cellId);
            return cell?.tag === "formal" && cell.content.tag === "instantiation"
                ? cell.content.name
                : undefined;
        },
        get model() {
            const cell = cellView(store, handle, cellId);
            return cell?.tag === "formal" && cell.content.tag === "instantiation"
                ? cell.content.model
                : null;
        },
        get specializations() {
            const cell = cellView(store, handle, cellId);
            return cell?.tag === "formal" && cell.content.tag === "instantiation"
                ? cell.content.specializations
                : [];
        },
        ...operations(store, handle, cellId, make),
    };
}

export function cellHandle<Handle, S extends Shape>(
    shape: S,
    store: DocumentStore<Handle>,
    handle: Handle,
    cellId: string,
): Cell<S> {
    const cell = Nb.getCellById(getModelDocumentView(store, handle).notebook, cellId);
    if (cell.tag === "rich-text") {
        return richTextHandle(store, handle, cellId);
    }
    if (cell.content.tag === "object") {
        const type = findObjectType(shape, cell.content.obType);
        if (type) {
            return objectHandle(store, handle, cellId, type);
        }
    }
    if (cell.content.tag === "morphism") {
        const type = findMorphismType(shape, cell.content.morType);
        if (type) {
            return morphismHandle(shape, store, handle, cellId, type);
        }
    }
    if (cell.content.tag === "instantiation") {
        return instantiationHandle(store, handle, cellId);
    }
    throw new Error(`Formal cell ${cellId} is not supported by the notebook shape.`);
}
