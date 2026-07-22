import { deepEqual } from "fast-equals";
import { v7 } from "uuid";

import {
    currentVersion,
    type Document,
    type ModelJudgment,
    type MorType,
    type NotebookCell,
    type Ob,
    type ObType,
} from "catcolab-document-types";

export interface ObjectType {
    readonly kind: "object";
    readonly obType: ObType;
}

export interface MorphismType {
    readonly kind: "morphism";
    readonly morType: MorType;
}

export const RichText = { kind: "rich-text" } as const;

export interface Shape {
    readonly theory: string;
    readonly objects?: readonly ObjectType[];
    readonly morphisms?: readonly MorphismType[];
}

type ModelDocument = Extract<Document, { type: "model" }>;
type ObjectTypes<S extends Shape> = NonNullable<S["objects"]>[number];
type MorphismTypes<S extends Shape> = NonNullable<S["morphisms"]>[number];
type CellType<S extends Shape> = typeof RichText | ObjectTypes<S> | MorphismTypes<S>;
type MatchingObjectType<O, Required> = O extends ObjectType
    ? O["obType"] extends Required
        ? Required extends O["obType"]
            ? O
            : never
        : never
    : never;
type EndpointObjectTypes<S extends Shape, T extends MorphismType> = T["morType"] extends {
    tag: "Hom";
    content: infer Required;
}
    ? MatchingObjectType<ObjectTypes<S>, Required>
    : ObjectTypes<S>;

export interface RichTextCell {
    readonly kind: "rich-text";
    readonly id: string;
    readonly content: string;

    update(patch: Partial<{ content: string }>): void;
}

export interface ObjectCell<T extends ObjectType> {
    readonly kind: "object";
    readonly id: string;
    readonly type: T;
    readonly label: string;

    update(patch: Partial<{ label: string | null }>): void;
}

export interface MorphismCell<S extends Shape, T extends MorphismType> {
    readonly kind: "morphism";
    readonly id: string;
    readonly type: T;
    readonly label: string;
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

type Cell<S extends Shape> =
    | RichTextCell
    | ObjectCell<ObjectTypes<S>>
    | MorphismCell<S, MorphismTypes<S>>;

type AddValue<S extends Shape, T extends CellType<S>> = T extends typeof RichText
    ? { content: string }
    : T extends ObjectType
      ? { label: string | null }
      : T extends MorphismType
        ? {
              label: string | null;
              from: ObjectCell<EndpointObjectTypes<S, T>> | null;
              to: ObjectCell<EndpointObjectTypes<S, T>> | null;
          }
        : never;

type AddedCell<S extends Shape, T extends CellType<S>> = T extends typeof RichText
    ? RichTextCell
    : T extends ObjectType
      ? ObjectCell<T>
      : T extends MorphismType
        ? MorphismCell<S, T>
        : never;

export interface Notebook<S extends Shape> {
    readonly shape: S;
    readonly document: ModelDocument;
    readonly title: string;

    add<T extends CellType<S>>(type: T, value: AddValue<S, T>): AddedCell<S, T>;
    cells(): readonly Cell<S>[];
    update(patch: Partial<{ title: string }>): void;
}

export interface Binder {
    createNotebook<S extends Shape>(shape: S, options: { title: string }): Promise<Notebook<S>>;
}

function persistedCell(document: ModelDocument, cellId: string): NotebookCell<ModelJudgment> {
    const cell = document.notebook.cellContents[cellId];
    if (!cell) {
        throw new Error(`Cell ${cellId} does not exist.`);
    }
    return cell;
}

function formalJudgment(document: ModelDocument, cellId: string): ModelJudgment {
    const cell = persistedCell(document, cellId);
    if (cell.tag !== "formal") {
        throw new Error(`Cell ${cellId} is not formal.`);
    }
    return cell.content;
}

function appendCell(document: ModelDocument, cell: NotebookCell<ModelJudgment>): void {
    document.notebook.cellOrder.push(cell.id);
    document.notebook.cellContents[cell.id] = cell;
}

function findObjectType<S extends Shape>(shape: S, obType: ObType): ObjectTypes<S> | undefined {
    return shape.objects?.find((type) => deepEqual(type.obType, obType)) as
        | ObjectTypes<S>
        | undefined;
}

function findMorphismType<S extends Shape>(
    shape: S,
    morType: MorType,
): MorphismTypes<S> | undefined {
    return shape.morphisms?.find((type) => deepEqual(type.morType, morType)) as
        | MorphismTypes<S>
        | undefined;
}

function richTextHandle(document: ModelDocument, cellId: string): RichTextCell {
    return {
        kind: "rich-text",
        id: cellId,
        get content() {
            const cell = persistedCell(document, cellId);
            if (cell.tag !== "rich-text") {
                throw new Error(`Cell ${cellId} is not rich text.`);
            }
            return cell.content;
        },
        update(patch) {
            if (patch.content === undefined) {
                return;
            }
            const cell = persistedCell(document, cellId);
            if (cell.tag !== "rich-text") {
                throw new Error(`Cell ${cellId} is not rich text.`);
            }
            cell.content = patch.content;
        },
    };
}

function objectHandle<T extends ObjectType>(
    document: ModelDocument,
    cellId: string,
    type: T,
): ObjectCell<T> {
    return {
        kind: "object",
        id: cellId,
        type,
        get label() {
            const judgment = formalJudgment(document, cellId);
            if (judgment.tag !== "object") {
                throw new Error(`Cell ${cellId} is not an object.`);
            }
            return judgment.name;
        },
        update(patch) {
            if (patch.label === undefined) {
                return;
            }
            const judgment = formalJudgment(document, cellId);
            if (judgment.tag !== "object") {
                throw new Error(`Cell ${cellId} is not an object.`);
            }
            judgment.name = patch.label ?? "";
        },
    };
}

function endpointHandle<S extends Shape>(
    shape: S,
    document: ModelDocument,
    endpoint: Ob | null,
): ObjectCell<ObjectTypes<S>> | null {
    if (endpoint?.tag !== "Basic") {
        return null;
    }

    for (const cellId of document.notebook.cellOrder) {
        const cell = persistedCell(document, cellId);
        if (cell.tag !== "formal" || cell.content.tag !== "object") {
            continue;
        }
        if (cell.content.id === endpoint.content) {
            const type = findObjectType(shape, cell.content.obType);
            return type ? objectHandle(document, cellId, type) : null;
        }
    }

    return null;
}

function endpointValue(
    document: ModelDocument,
    endpoint: ObjectCell<ObjectType> | null,
): Ob | null {
    if (!endpoint) {
        return null;
    }
    const judgment = formalJudgment(document, endpoint.id);
    if (judgment.tag !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return { tag: "Basic", content: judgment.id };
}

function morphismHandle<S extends Shape, T extends MorphismTypes<S>>(
    shape: S,
    document: ModelDocument,
    cellId: string,
    type: T,
): MorphismCell<S, T> {
    return {
        kind: "morphism",
        id: cellId,
        type,
        get label() {
            const judgment = formalJudgment(document, cellId);
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return judgment.name;
        },
        get from() {
            const judgment = formalJudgment(document, cellId);
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return endpointHandle(shape, document, judgment.dom) as ObjectCell<
                EndpointObjectTypes<S, T>
            > | null;
        },
        get to() {
            const judgment = formalJudgment(document, cellId);
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            return endpointHandle(shape, document, judgment.cod) as ObjectCell<
                EndpointObjectTypes<S, T>
            > | null;
        },
        update(patch) {
            const judgment = formalJudgment(document, cellId);
            if (judgment.tag !== "morphism") {
                throw new Error(`Cell ${cellId} is not a morphism.`);
            }
            const dom = Object.hasOwn(patch, "from")
                ? endpointValue(document, patch.from ?? null)
                : undefined;
            const cod = Object.hasOwn(patch, "to")
                ? endpointValue(document, patch.to ?? null)
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

function cellHandle<S extends Shape>(shape: S, document: ModelDocument, cellId: string): Cell<S> {
    const cell = persistedCell(document, cellId);
    if (cell.tag === "rich-text") {
        return richTextHandle(document, cellId);
    }

    switch (cell.content.tag) {
        case "object": {
            const type = findObjectType(shape, cell.content.obType);
            if (!type) {
                throw new Error(`Object cell ${cellId} is not supported by the notebook shape.`);
            }
            return objectHandle(document, cellId, type);
        }
        case "morphism": {
            const type = findMorphismType(shape, cell.content.morType);
            if (!type) {
                throw new Error(`Morphism cell ${cellId} is not supported by the notebook shape.`);
            }
            return morphismHandle(shape, document, cellId, type);
        }
        default:
            throw new Error(`Formal cell ${cellId} is not supported yet.`);
    }
}

function notebookFromDocument<S extends Shape>(shape: S, document: ModelDocument): Notebook<S> {
    return {
        shape,
        document,
        get title() {
            return document.name;
        },
        add<T extends CellType<S>>(type: T, value: AddValue<S, T>) {
            const cellId = v7();

            if (type.kind === "rich-text") {
                const richText = value as { content: string };
                appendCell(document, {
                    tag: "rich-text",
                    id: cellId,
                    content: richText.content,
                });
                return richTextHandle(document, cellId) as AddedCell<S, T>;
            }

            if (type.kind === "object") {
                const object = value as { label: string | null };
                appendCell(document, {
                    tag: "formal",
                    id: cellId,
                    content: {
                        tag: "object",
                        id: v7(),
                        name: object.label ?? "",
                        obType: type.obType,
                    },
                });
                return objectHandle(document, cellId, type as ObjectTypes<S>) as AddedCell<S, T>;
            }

            const morphism = value as AddValue<S, MorphismTypes<S>>;
            appendCell(document, {
                tag: "formal",
                id: cellId,
                content: {
                    tag: "morphism",
                    id: v7(),
                    name: morphism.label ?? "",
                    morType: type.morType,
                    dom: endpointValue(document, morphism.from),
                    cod: endpointValue(document, morphism.to),
                },
            });
            return morphismHandle(shape, document, cellId, type as MorphismTypes<S>) as AddedCell<
                S,
                T
            >;
        },
        cells() {
            return document.notebook.cellOrder.map((cellId) => cellHandle(shape, document, cellId));
        },
        update(patch) {
            if (patch.title !== undefined) {
                document.name = patch.title;
            }
        },
    };
}

export function createBinder(): Binder {
    return {
        async createNotebook<S extends Shape>(shape: S, options: { title: string }) {
            const document: ModelDocument = {
                type: "model",
                name: options.title,
                theory: shape.theory,
                notebook: {
                    cellOrder: [],
                    cellContents: {},
                },
                version: currentVersion(),
            };

            return notebookFromDocument(shape, document);
        },
    };
}
