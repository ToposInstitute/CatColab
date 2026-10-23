import { Model, Nb, type ModelDocument } from "catcolab-document-methods";
import type { ModelJudgment } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import {
    findMorphismType,
    findObjectType,
    type AnyCellType,
    type CellTypeOf,
    type CodomainObjectTypesOf,
    type DomainObjectTypesOf,
    type EquationType,
    type MorphismType,
    type MorphismTypesOf,
    type ObjectType,
    type RichTextType,
    type Shape,
} from "../shape";
import type { Commit } from "../transaction";
import { assertExhaustive } from "../util/assert_exhaustive";
import { createSubscriptionScope } from "../util/subscription-scope";
import { obFromObjectCell } from "./cell";
import {
    parseNotebookData,
    getNotebookData,
    shapeHasCell,
    type CellData,
    type EquationCellData,
    type EquationSideData,
    type MorphismCellData,
    type ModelNotebookData,
    type ObjectCellData,
    type RichTextCellData,
} from "./data";
import { deleteNotebookCell } from "./delete-cell";
import type { ModelValidation } from "./elaborated-model";
import { morphismTypesEqual, objectTypesEqual } from "./equality";
import { morFromSide } from "./equation-translate";
import type { NotebookDocument } from "./notebook-document";
import { updateNotebookCell, type AnyCellPatch, type CellPatchOf, type CellRef } from "./update";
import { createNotebookValidator } from "./validation";

export type { ModelDocument } from "catcolab-document-methods";

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
              from: ObjectCellData<DomainObjectTypesOf<S, T>> | null;
              to: ObjectCellData<CodomainObjectTypesOf<S, T>> | null;
          }
        : T extends EquationType
          ? { label: string | null; lhs?: EquationSideData; rhs?: EquationSideData }
          : never;

/** The data of a cell added to a notebook, by the cell type passed to [`Notebook.add`]. */
export type AddedCellOf<S extends Shape, T extends CellTypeOf<S>> = T extends RichTextType
    ? RichTextCellData
    : T extends ObjectType
      ? ObjectCellData<T>
      : T extends MorphismType
        ? MorphismCellData<T>
        : T extends EquationType
          ? EquationCellData
          : never;

function isCellType(value: AnyCellType | Shape): value is AnyCellType {
    return "kind" in value;
}

function shapeSupportsCell(shape: Shape, type: AnyCellType): boolean {
    switch (type.kind) {
        case "rich-text":
            return true;
        case "object":
            return findObjectType(shape, type.obType) !== undefined;
        case "morphism":
            return findMorphismType(shape, type.morType) !== undefined;
        case "path-equation":
            return shape.supportsEquations === true;
        default:
            return assertExhaustive(type["kind"]);
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

export function cellMatchesFilter(cell: CellData, filter: AnyCellType | Shape): boolean {
    if (isCellType(filter)) {
        switch (filter.kind) {
            case "rich-text":
                return cell.kind === "rich-text";
            case "object":
                if (cell.kind !== "object") {
                    return false;
                }
                return objectTypesEqual(filter.obType, cell.type.obType);
            case "morphism":
                if (cell.kind !== "morphism") {
                    return false;
                }
                return morphismTypesEqual(filter.morType, cell.type.morType);
            case "path-equation":
                return cell.kind === "path-equation";
            default:
                return assertExhaustive(filter["kind"]);
        }
    }

    return shapeHasCell(filter, cell);
}

export interface Notebook<
    S extends Shape = Shape,
    D extends NotebookDocument = NotebookDocument,
    H = unknown,
    V = unknown,
> {
    readonly shape: S;
    readonly title: string;
    readonly handle: H;

    add<T extends CellTypeOf<S>>(type: T, values: CellValuesOf<S, T>): AddedCellOf<S, T>;
    cells(): readonly CellData[];
    cellsOf(typeOrShape: AnyCellType | Shape): readonly CellData[];
    supports(typeOrShape: AnyCellType | Shape): boolean;
    /** A read-only view of the document data, a nicer presentation than what `dump()` returns. */
    data(): ModelNotebookData;
    update(patch: Partial<{ title: string }>): void;
    /** Patch a cell. */
    update<C extends CellData>(cell: C, patch: CellPatchOf<S, C>): void;
    delete(cell: CellRef): void;
    /** Dump the underlying document object. */
    dump(): D;
    onChange(callback: () => void): () => void;
    validate(): Promise<ModelValidation<S>>;
    onValidate(callback: (result: ModelValidation<S>) => void): () => void;
    /** Release subscriptions owned by this notebook. Idempotent. */
    dispose(): void;

    /** Undo the changes this notebook's document received in a commit. */
    revert(commit: Commit<H, V>): void;
}

export function modelNotebookFromStore<Handle, S extends Shape, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): Notebook<S, ModelDocument, Handle, Version> {
    const validator = createNotebookValidator(shape, store, handle);
    const scope = createSubscriptionScope();

    function appendCell(
        cell: ReturnType<typeof Nb.newRichTextCell> | Nb.FormalCell<ModelJudgment>,
    ): CellData {
        store.changeDocument(handle, (document) => {
            Nb.appendCell((document as ModelDocument).notebook, cell);
        });
        const added = getNotebookData(store, handle).cells.find(
            (candidate) => candidate.id === cell.id,
        );
        if (!added) {
            throw new Error(`Cell ${cell.id} was not added.`);
        }
        return added;
    }

    return {
        shape,
        handle,
        get title() {
            const parsed = parseNotebookData(store.getDocumentSnapshot(handle));
            return parsed.tag === "Ok" ? parsed.content.value.name : "";
        },
        add<T extends CellTypeOf<S>>(type: T, values: CellValuesOf<S, T>) {
            if (type.kind === "rich-text") {
                const richText = values as { content: string };
                return appendCell(Nb.newRichTextCell(richText.content)) as AddedCellOf<S, T>;
            }

            if (type.kind === "object") {
                const object = values as { label: string | null };
                const judgment = Model.newObjectDecl(type.obType);
                judgment.name = object.label ?? "";
                return appendCell(Nb.newFormalCell<ModelJudgment>(judgment)) as AddedCellOf<S, T>;
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
                const data = getNotebookData(store, handle);
                decl.lhs = morFromSide(data, equation.lhs ?? []);
                decl.rhs = morFromSide(data, equation.rhs ?? []);
                return appendCell(Nb.newFormalCell<ModelJudgment>(decl)) as AddedCellOf<S, T>;
            }

            const morphism = values as CellValuesOf<S, MorphismTypesOf<S>>;
            const judgment = Model.newMorphismDecl(type.morType);
            judgment.name = morphism.label ?? "";
            const data = getNotebookData(store, handle);
            judgment.dom = obFromObjectCell(data, morphism.from);
            judgment.cod = obFromObjectCell(data, morphism.to);
            return appendCell(Nb.newFormalCell<ModelJudgment>(judgment)) as AddedCellOf<S, T>;
        },
        cells() {
            return getNotebookData(store, handle).cells.filter((cell) => shapeHasCell(shape, cell));
        },
        cellsOf(filter) {
            return this.cells().filter((cell) => cellMatchesFilter(cell, filter));
        },
        supports(filter) {
            if (isCellType(filter)) {
                return shapeSupportsCell(shape, filter);
            }
            return shapeSupportsShape(shape, filter);
        },
        data() {
            return getNotebookData(store, handle);
        },
        update(target: Partial<{ title: string }> | CellRef, patch?: AnyCellPatch<S>) {
            if ("id" in target) {
                updateNotebookCell(store, handle, target, patch ?? {});
                return;
            }
            if (target.title !== undefined) {
                store.changeDocument(handle, (document) => {
                    (document as ModelDocument).name = target.title as string;
                });
            }
        },
        delete(cell) {
            deleteNotebookCell(store, handle, cell.id);
        },
        dump() {
            return structuredClone(store.getDocumentSnapshot(handle)) as ModelDocument;
        },
        onChange(callback) {
            return scope.track(store.subscribe(handle, callback));
        },
        validate: validator.validate,
        onValidate: (callback) => scope.track(validator.onValidate(callback)),
        dispose: scope.dispose,
        revert(commit) {
            const change = commit.documents.get(handle);
            if (change === undefined) {
                throw new Error("The notebook's document was not part of the commit.");
            }
            store.revertCommit(handle, change);
        },
    };
}
