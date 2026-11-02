import type { ModelJudgment, RichTextContent } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import { isRecord } from "../document/parse-structure";
import {
    findMorphismType,
    type CodomainObjectTypesOf,
    type DomainObjectTypesOf,
    type MorphismEndpoints,
    type MorphismEndpointValue,
    type MorphismType,
    type ObjectType,
    type Shape,
} from "../shape";
import { assertExhaustive } from "../util/assert_exhaustive";
import { obFromMorphismEndpoint } from "./cell";
import { getNotebookData, type CellData, type EquationSideData, type ObjectCellData } from "./data";
import type { ModelDocument } from "./document";
import type { EndpointData } from "./endpoint";
import { morFromSide } from "./equation-translate";

/** A reference to a cell: cell data, or anything carrying the cell's id. */
export type CellRef = { readonly id: string };

export function isCellRef(value: unknown): value is CellRef {
    return isRecord(value) && typeof value["id"] === "string";
}

export type RichTextCellPatch = Partial<{ content: RichTextContent }>;
export type ObjectCellPatch = Partial<{ label: string | null }>;
export type MorphismCellPatch<S extends Shape, M extends MorphismType> = Partial<{
    label: string | null;
    from: MorphismEndpointValue<M, "domain", ObjectCellData<DomainObjectTypesOf<S, M>>> | null;
    to: MorphismEndpointValue<M, "codomain", ObjectCellData<CodomainObjectTypesOf<S, M>>> | null;
}>;
export type EquationCellPatch = Partial<{
    label: string | null;
    lhs: EquationSideData;
    rhs: EquationSideData;
}>;

/** The patch accepted by `Notebook.update` for a cell, by the cell's kind. */
export type CellPatchOf<S extends Shape, C extends CellData> = C extends { kind: "rich-text" }
    ? RichTextCellPatch
    : C extends { kind: "object"; type: ObjectType }
      ? ObjectCellPatch
      : C extends { kind: "morphism"; type: infer M extends MorphismType }
        ? MorphismCellPatch<S, M>
        : C extends { kind: "path-equation" }
          ? EquationCellPatch
          : never;

type AnyMorphismCellPatch<S extends Shape> = Partial<{
    label: string | null;
    from: EndpointData<ObjectCellData<DomainObjectTypesOf<S, MorphismType>>> | null;
    to: EndpointData<ObjectCellData<CodomainObjectTypesOf<S, MorphismType>>> | null;
}>;

export type AnyCellPatch<S extends Shape> =
    | RichTextCellPatch
    | ObjectCellPatch
    | AnyMorphismCellPatch<S>
    | EquationCellPatch;

/** Apply a patch to the cell with the given id. Missing cells are ignored. */
export function updateNotebookCell<Handle, S extends Shape, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
    shape: S,
    cell: CellRef,
    patch: AnyCellPatch<S>,
): void {
    const cellId = cell.id;
    const data = getNotebookData(store, handle);
    const stored = data.cells.find((candidate) => candidate.id === cellId);
    if (!stored) {
        return;
    }

    type StoredCell = ModelDocument["notebook"]["cellContents"][string];
    if (stored.kind === "rich-text") {
        if (!("content" in patch) || patch.content === undefined) {
            return;
        }
        const content = patch.content;
        store.changeDocument(handle, (document) => {
            const cell = (document as ModelDocument).notebook.cellContents[cellId] as Extract<
                StoredCell,
                { tag: "rich-text" }
            >;
            cell.content = content;
        });
        return;
    }

    if (Object.values(patch).every((value) => value === undefined)) {
        return;
    }

    const label = "label" in patch && patch.label !== undefined ? { name: patch.label ?? "" } : {};
    let changes: Partial<ModelJudgment> = label;
    switch (stored.kind) {
        case "object":
            break;
        case "morphism": {
            const morphism = patch as AnyMorphismCellPatch<S>;
            const type = findMorphismType(shape, stored.type.morType) ?? stored.type;
            const endpoints = (type as MorphismType & { readonly endpoints?: MorphismEndpoints })
                .endpoints;
            changes = {
                ...label,
                ...(Object.hasOwn(morphism, "from")
                    ? {
                          dom: obFromMorphismEndpoint(
                              data,
                              endpoints?.domain,
                              morphism.from ?? null,
                          ),
                      }
                    : {}),
                ...(Object.hasOwn(morphism, "to")
                    ? {
                          cod: obFromMorphismEndpoint(
                              data,
                              endpoints?.codomain,
                              morphism.to ?? null,
                          ),
                      }
                    : {}),
            };
            break;
        }
        case "path-equation": {
            const equation = patch as EquationCellPatch;
            changes = {
                ...label,
                ...(equation.lhs !== undefined ? { lhs: morFromSide(data, equation.lhs) } : {}),
                ...(equation.rhs !== undefined ? { rhs: morFromSide(data, equation.rhs) } : {}),
            };
            break;
        }
        default:
            return assertExhaustive(stored["kind"]);
    }

    store.changeDocument(handle, (document) => {
        const cell = (document as ModelDocument).notebook.cellContents[cellId] as Extract<
            StoredCell,
            { tag: "formal" }
        >;
        Object.assign(cell.content, changes);
    });
}
