import type { EqnDecl } from "catcolab-document-types";
import type { DeepReadonly, DocumentStore } from "../document-store";
import { deleteNotebookCell } from "../notebook-document";
import type { MorphismTypesOf, ObjectTypesOf, Shape } from "../shape";
import { getModelCell, type MorphismCell, type ObjectCell } from "./cell";
import { createCellReadView, describeModelCell } from "./cell-reads";
import type { ModelDocument } from "./document";
import { morFromSide } from "./equation-translate";

/** A side of an equation: the identity on an object, or a composite of
morphisms. The empty composite means the side is unspecified.

Null morphisms are tolerated in both directions: reading yields them for
references that cannot be resolved, while writing drops them. */
export type EquationSide<S extends Shape = Shape> =
    | ObjectCell<ObjectTypesOf<S>>
    | ReadonlyArray<MorphismCell<S, MorphismTypesOf<S>> | null>;

/** An equation between two paths of morphisms in a model. */
export interface EquationCell<S extends Shape = Shape> {
    readonly kind: "path-equation";
    readonly id: string;
    readonly label: string | undefined;
    readonly lhs: EquationSide<S>;
    readonly rhs: EquationSide<S>;

    update(
        patch: Partial<{
            label: string | null;
            lhs: EquationSide<S>;
            rhs: EquationSide<S>;
        }>,
    ): void;
    delete(): void;
}

function tryGetEquationDecl(
    document: Readonly<ModelDocument>,
    cellId: string,
): EqnDecl | undefined {
    const cell = document.notebook.cellContents[cellId];
    if (!cell) {
        return undefined;
    }
    if (cell.tag !== "formal" || cell.content.tag !== "equation") {
        throw new Error(`Cell ${cellId} is not an equation.`);
    }
    return cell.content;
}

export function getEquationCell<Handle, S extends Shape, Version>(
    shape: S,
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    cellId: string,
): EquationCell<S> {
    return createCellReadView<EquationCell<S>>(
        {
            kind: "path-equation",
            id: cellId,
            update(patch) {
                const document = store.getDocumentSnapshot(handle)
                    .document as Readonly<ModelDocument>;
                if (!tryGetEquationDecl(document, cellId)) {
                    return;
                }
                store.changeDocument(handle, (storedDocument) => {
                    const decl = tryGetEquationDecl(storedDocument as ModelDocument, cellId);
                    if (!decl) {
                        return;
                    }
                    if (patch.label !== undefined) {
                        decl.name = patch.label ?? "";
                    }
                    if (patch.lhs !== undefined) {
                        decl.lhs = morFromSide(storedDocument as ModelDocument, patch.lhs);
                    }
                    if (patch.rhs !== undefined) {
                        decl.rhs = morFromSide(storedDocument as ModelDocument, patch.rhs);
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
