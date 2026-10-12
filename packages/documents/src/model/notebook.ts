import { Model, Nb } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import type { NotebookDocument } from "../notebook-document";
import { getRichTextCell, type RichTextCell } from "../rich-text";
import type {
    AnyCellType,
    CellTypeOf,
    CodomainObjectTypesOf,
    DomainObjectTypesOf,
    EquationType,
    MorphismType,
    MorphismTypesOf,
    ObjectType,
    ObjectTypesOf,
    RichTextType,
    Shape,
} from "../shape";
import type { Commit } from "../transaction";
import {
    getModelCell,
    getMorphismCell,
    getObjectCell,
    obFromObjectCell,
    type CellOf,
    type MorphismCell,
    type ObjectCell,
} from "./cell";
import type { ModelDocument } from "./document";
import type { ModelValidation, ModelValidationView } from "./elaborated-model";
import { morphismTypesEqual, objectTypesEqual } from "./equality";
import { getEquationCell, type EquationCell, type EquationSide } from "./equation";
import { morFromSide } from "./equation-translate";
import { createNotebookValidator } from "./validation";

/**
 * The value given to [`Notebook.add`].
 */
type CellValuesOf<S extends Shape, T extends CellTypeOf<S>> = T extends RichTextType
    ? { content: string }
    : T extends ObjectType
      ? { label: string | null }
      : T extends MorphismType
        ? {
              label: string | null;
              from: ObjectCell<DomainObjectTypesOf<S, T>> | null;
              to: ObjectCell<CodomainObjectTypesOf<S, T>> | null;
          }
        : T extends EquationType
          ? { label: string | null; lhs?: EquationSide<S>; rhs?: EquationSide<S> }
          : never;
/**
 * The type of a cell after being added to a notebook. This resolves to a
 * [`CellOf`] switched by the [`T`] [`CellTypeOf`] passed to it.
 */
type AddedCellOf<S extends Shape, T extends CellTypeOf<S>> = T extends RichTextType
    ? RichTextCell
    : T extends ObjectType
      ? ObjectCell<T>
      : T extends MorphismType
        ? MorphismCell<S, T>
        : T extends EquationType
          ? EquationCell<S>
          : never;

function isCellType(value: AnyCellType | Shape): value is AnyCellType {
    return "kind" in value;
}

function shapeSupportsCell(shape: Shape, type: AnyCellType): boolean {
    switch (type.kind) {
        case "rich-text":
            return true;
        case "object":
            if (shape.objects === undefined) {
                return false;
            }
            for (const candidate of shape.objects) {
                if (objectTypesEqual(candidate.obType, type.obType)) {
                    return true;
                }
            }
            return false;
        case "morphism":
            if (shape.morphisms === undefined) {
                return false;
            }
            for (const candidate of shape.morphisms) {
                if (morphismTypesEqual(candidate.morType, type.morType)) {
                    return true;
                }
            }
            return false;
        case "path-equation":
            return shape.supportsEquations === true;
    }
}

function shapeSupportsShape(shape: Shape, required: Shape): boolean {
    if (required.objects !== undefined) {
        for (const type of required.objects) {
            if (!shapeSupportsCell(shape, type)) {
                return false;
            }
        }
    }

    if (required.morphisms !== undefined) {
        for (const type of required.morphisms) {
            if (!shapeSupportsCell(shape, type)) {
                return false;
            }
        }
    }

    if (required.informal !== undefined) {
        for (const type of required.informal) {
            if (!shapeSupportsCell(shape, type)) {
                return false;
            }
        }
    }

    return true;
}

function cellMatchesFilter<S extends Shape>(cell: CellOf<S>, filter: AnyCellType | Shape): boolean {
    if (isCellType(filter)) {
        switch (filter.kind) {
            case "rich-text":
                return cell.kind === "rich-text";
            case "object":
                if (cell.kind !== "object") {
                    return false;
                }
                return objectTypesEqual(cell.type.obType, filter.obType);
            case "morphism":
                if (cell.kind !== "morphism") {
                    return false;
                }
                return morphismTypesEqual(cell.type.morType, filter.morType);
            case "path-equation":
                return cell.kind === "path-equation";
        }
    }

    switch (cell.kind) {
        case "rich-text":
            if (filter.informal === undefined) {
                return false;
            }
            return filter.informal.length > 0;
        case "object":
            if (filter.objects === undefined) {
                return false;
            }
            for (const type of filter.objects) {
                if (objectTypesEqual(cell.type.obType, type.obType)) {
                    return true;
                }
            }
            return false;
        case "morphism":
            if (filter.morphisms === undefined) {
                return false;
            }
            for (const type of filter.morphisms) {
                if (morphismTypesEqual(cell.type.morType, type.morType)) {
                    return true;
                }
            }
            return false;
        case "path-equation":
            return filter.supportsEquations === true;
    }
}

export interface Notebook<
    S extends Shape,
    D extends NotebookDocument = NotebookDocument,
    H = unknown,
    V = unknown,
> {
    readonly shape: S;
    readonly document: Readonly<D>;
    readonly title: string;
    readonly handle: H;

    add<T extends CellTypeOf<S>>(type: T, values: CellValuesOf<S, T>): AddedCellOf<S, T>;
    cells(): readonly CellOf<S>[];
    cellsOf(typeOrShape: AnyCellType | Shape): readonly CellOf<S>[];
    supports(typeOrShape: AnyCellType | Shape): boolean;
    update(patch: Partial<{ title: string }>): void;
    dump(): D;
    onChange(callback: () => void): () => void;
    validate(): Promise<ModelValidation<S>>;
    onValidate(callback: (result: ModelValidation<S>) => void): () => void;
    /** Create a live, reactive view of the notebook's validation state. The
     * caller must dispose the view when it is no longer needed. */
    createValidationView(): ModelValidationView<S>;

    /** Undo the changes this notebook's document received in a commit. */
    revert(commit: Commit<H, V>): void;
}

export function modelNotebookFromStore<Handle, S extends Shape, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): Notebook<S, ModelDocument, Handle, Version> {
    const validator = createNotebookValidator(shape, store, handle);

    function appendCell(
        cell: ReturnType<typeof Nb.newRichTextCell> | Nb.FormalCell<ModelJudgment>,
    ): void {
        store.changeDocument(handle, (document) => {
            Nb.appendCell((document as ModelDocument).notebook, cell);
        });
    }

    return {
        shape,
        handle,
        get document() {
            return store.getDocumentView(handle) as Readonly<ModelDocument>;
        },
        get title() {
            return (store.getDocumentView(handle) as Readonly<ModelDocument>).name;
        },
        add<T extends CellTypeOf<S>>(type: T, values: CellValuesOf<S, T>) {
            if (type.kind === "rich-text") {
                const richText = values as { content: string };
                const cell = Nb.newRichTextCell(richText.content);
                appendCell(cell);
                return getRichTextCell(store, handle, cell.id) as AddedCellOf<S, T>;
            }

            if (type.kind === "object") {
                const object = values as { label: string | null };
                const judgment = Model.newObjectDecl(type.obType);
                judgment.name = object.label ?? "";
                const cell = Nb.newFormalCell<ModelJudgment>(judgment);
                appendCell(cell);
                return getObjectCell(
                    store,
                    handle,
                    cell.id,
                    type as ObjectTypesOf<S>,
                ) as AddedCellOf<S, T>;
            }

            if (type.kind === "path-equation") {
                if (!shape.supportsEquations) {
                    throw new Error(
                        `Shape \`${shape.theory ?? "unnamed"}\` does not support path equations`,
                    );
                }
                const equation = values as CellValuesOf<S, EquationType>;
                const decl = Model.newEquationDecl();
                decl.name = equation.label ?? "";
                const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
                decl.lhs = morFromSide(document, equation.lhs ?? []);
                decl.rhs = morFromSide(document, equation.rhs ?? []);
                const cell = Nb.newFormalCell<ModelJudgment>(decl);
                appendCell(cell);
                return getEquationCell(shape, store, handle, cell.id) as AddedCellOf<S, T>;
            }

            const morphism = values as CellValuesOf<S, MorphismTypesOf<S>>;
            const judgment = Model.newMorphismDecl(type.morType);
            judgment.name = morphism.label ?? "";
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            judgment.dom = obFromObjectCell(document, morphism.from);
            judgment.cod = obFromObjectCell(document, morphism.to);
            const cell = Nb.newFormalCell<ModelJudgment>(judgment);
            appendCell(cell);
            return getMorphismCell(
                shape,
                store,
                handle,
                cell.id,
                type as MorphismTypesOf<S>,
            ) as AddedCellOf<S, T>;
        },
        cells() {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            return document.notebook.cellOrder.map((cellId) =>
                getModelCell(shape, store, handle, cellId),
            );
        },
        cellsOf(filter: AnyCellType | Shape) {
            return this.cells().filter((cell) => cellMatchesFilter(cell, filter));
        },
        supports(filter) {
            if (isCellType(filter)) {
                return shapeSupportsCell(shape, filter);
            }
            return shapeSupportsShape(shape, filter);
        },
        update(patch) {
            if (patch.title !== undefined) {
                store.changeDocument(handle, (document) => {
                    (document as ModelDocument).name = patch.title as string;
                });
            }
        },
        dump() {
            const document = store.getDocumentView(handle) as Readonly<ModelDocument>;
            return store.copyValue(handle, document) as ModelDocument;
        },
        onChange(callback) {
            return store.subscribe(handle, callback);
        },
        validate: validator.validate,
        onValidate: validator.onValidate,
        createValidationView: validator.createValidationView,
        revert(commit) {
            const change = commit.documents.get(handle);
            if (change === undefined) {
                throw new Error("The notebook's document was not part of the commit.");
            }
            store.revertCommit(handle, change);
        },
    };
}
