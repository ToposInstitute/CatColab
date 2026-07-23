import type { Link, ModelJudgment, Ob, SpecializeModel } from "catcolab-document-types";
import type { NotebookCore } from "./notebook-core";
import { findMorphismType, findObjectType } from "./shape";
import type {
    EndpointObjectTypes,
    MorphismType,
    MorphismTypes,
    ObjectType,
    ObjectTypes,
    Shape,
} from "./shape";

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

function cellView(core: NotebookCore<ModelJudgment>, cellId: string) {
    return core.get(cellId);
}

function operations<Formal, C>(
    core: NotebookCore<Formal>,
    cellId: string,
    make: (id: string) => C,
) {
    return {
        duplicate(): C {
            return make(core.duplicate(cellId));
        },
        moveUp() {
            core.moveUp(cellId);
        },
        moveDown() {
            core.moveDown(cellId);
        },
        moveTo(index: number) {
            core.moveTo(cellId, index);
        },
        delete() {
            core.delete(cellId);
        },
    };
}

export function richTextHandle<Formal>(core: NotebookCore<Formal>, cellId: string): RichTextCell {
    const make = (id: string) => richTextHandle(core, id);
    return {
        kind: "rich-text",
        id: cellId,
        get content() {
            const cell = core.get(cellId);
            return cell?.tag === "rich-text" ? cell.content : undefined;
        },
        update(patch) {
            if (patch.content === undefined) {
                return;
            }
            core.changeCell(cellId, (cell) => {
                if (cell?.tag === "rich-text") {
                    cell.content = patch.content as string;
                }
            });
        },
        ...operations(core, cellId, make),
    };
}

export function objectHandle<T extends ObjectType>(
    core: NotebookCore<ModelJudgment>,
    cellId: string,
    type: T,
): ObjectCell<T> {
    const make = (id: string) => objectHandle(core, id, type);
    return {
        kind: "object",
        id: cellId,
        type,
        get label() {
            const cell = cellView(core, cellId);
            return cell?.tag === "formal" && cell.content.tag === "object"
                ? cell.content.name
                : undefined;
        },
        update(patch) {
            if (patch.label === undefined) {
                return;
            }
            core.changeCell(cellId, (cell) => {
                if (cell?.tag === "formal" && cell.content.tag === "object") {
                    cell.content.name = patch.label ?? "";
                }
            });
        },
        ...operations(core, cellId, make),
    };
}

function endpointHandle<S extends Shape>(
    shape: S,
    core: NotebookCore<ModelJudgment>,
    endpoint: Ob | null,
): ObjectCell<ObjectTypes<S>> | null {
    if (endpoint?.tag !== "Basic") {
        return null;
    }
    for (const cell of core.cells()) {
        if (
            cell.tag === "formal" &&
            cell.content.tag === "object" &&
            cell.content.id === endpoint.content
        ) {
            const type = findObjectType(shape, cell.content.obType);
            return type ? objectHandle(core, cell.id, type) : null;
        }
    }
    return null;
}

export function endpointValue(
    core: NotebookCore<ModelJudgment>,
    endpoint: ObjectCell<ObjectType> | null,
): Ob | null {
    if (!endpoint) {
        return null;
    }
    const cell = cellView(core, endpoint.id);
    if (cell?.tag !== "formal" || cell.content.tag !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return { tag: "Basic", content: cell.content.id };
}

export function objectGeneratorId(
    core: NotebookCore<ModelJudgment>,
    endpoint: ObjectCell<ObjectType>,
): string {
    const cell = cellView(core, endpoint.id);
    if (cell?.tag !== "formal" || cell.content.tag !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return cell.content.id;
}

export function morphismHandle<S extends Shape, T extends MorphismTypes<S>>(
    shape: S,
    core: NotebookCore<ModelJudgment>,
    cellId: string,
    type: T,
): MorphismCell<S, T> {
    const make = (id: string) => morphismHandle(shape, core, id, type);
    return {
        kind: "morphism",
        id: cellId,
        type,
        get label() {
            const cell = cellView(core, cellId);
            return cell?.tag === "formal" && cell.content.tag === "morphism"
                ? cell.content.name
                : undefined;
        },
        get from() {
            const cell = cellView(core, cellId);
            const endpoint =
                cell?.tag === "formal" && cell.content.tag === "morphism" ? cell.content.dom : null;
            return endpointHandle(shape, core, endpoint) as ObjectCell<
                EndpointObjectTypes<S, T>
            > | null;
        },
        get to() {
            const cell = cellView(core, cellId);
            const endpoint =
                cell?.tag === "formal" && cell.content.tag === "morphism" ? cell.content.cod : null;
            return endpointHandle(shape, core, endpoint) as ObjectCell<
                EndpointObjectTypes<S, T>
            > | null;
        },
        update(patch) {
            const dom = Object.hasOwn(patch, "from")
                ? endpointValue(core, patch.from ?? null)
                : undefined;
            const cod = Object.hasOwn(patch, "to")
                ? endpointValue(core, patch.to ?? null)
                : undefined;
            core.changeCell(cellId, (cell) => {
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
        ...operations(core, cellId, make),
    };
}

export function instantiationHandle(
    core: NotebookCore<ModelJudgment>,
    cellId: string,
): InstantiationCell {
    const make = (id: string) => instantiationHandle(core, id);
    return {
        kind: "instantiation",
        id: cellId,
        get label() {
            const cell = cellView(core, cellId);
            return cell?.tag === "formal" && cell.content.tag === "instantiation"
                ? cell.content.name
                : undefined;
        },
        get model() {
            const cell = cellView(core, cellId);
            return cell?.tag === "formal" && cell.content.tag === "instantiation"
                ? cell.content.model
                : null;
        },
        get specializations() {
            const cell = cellView(core, cellId);
            return cell?.tag === "formal" && cell.content.tag === "instantiation"
                ? cell.content.specializations
                : [];
        },
        ...operations(core, cellId, make),
    };
}

export function cellHandle<S extends Shape>(
    shape: S,
    core: NotebookCore<ModelJudgment>,
    cellId: string,
): Cell<S> {
    const cell = cellView(core, cellId);
    if (!cell) {
        throw new Error(`Cell ${cellId} does not exist.`);
    }
    if (cell.tag === "rich-text") {
        return richTextHandle(core, cellId);
    }
    if (cell.content.tag === "object") {
        const type = findObjectType(shape, cell.content.obType);
        if (type) {
            return objectHandle(core, cellId, type);
        }
    }
    if (cell.content.tag === "morphism") {
        const type = findMorphismType(shape, cell.content.morType);
        if (type) {
            return morphismHandle(shape, core, cellId, type);
        }
    }
    if (cell.content.tag === "instantiation") {
        return instantiationHandle(core, cellId);
    }
    throw new Error(`Formal cell ${cellId} is not supported by the notebook shape.`);
}
