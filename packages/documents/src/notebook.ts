import { v7 } from "uuid";

import {
    cellHandle,
    endpointValue,
    morphismHandle,
    objectHandle,
    richTextHandle,
    type Cell,
    type MorphismCell,
    type ObjectCell,
    type RichTextCell,
} from "./cell";
import { appendCell, type ModelDocument } from "./model-document";
import type {
    CellType,
    EndpointObjectTypes,
    MorphismType,
    MorphismTypes,
    ObjectType,
    ObjectTypes,
    RichTextType,
    Shape,
} from "./shape";

type AddValue<S extends Shape, T extends CellType<S>> = T extends RichTextType
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

type AddedCell<S extends Shape, T extends CellType<S>> = T extends RichTextType
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

export function notebookFromDocument<S extends Shape>(
    shape: S,
    document: ModelDocument,
): Notebook<S> {
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
