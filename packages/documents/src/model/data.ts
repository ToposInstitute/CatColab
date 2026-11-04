import type { Ob, Mor, ObType, MorType, RichTextContent } from "catcolab-document-types";
import type { DocumentStore } from "../document-store";
import {
    type StructuralIssue,
    type StructurallyValid,
    type WithIssues,
} from "../document/parse-structure";
import type { Result } from "../result";
import {
    findMorphismType,
    findObjectType,
    type MorphismType,
    type ObjectType,
    type Shape,
} from "../shape";
import { assertExhaustive } from "../util/assert_exhaustive";
import type { DeepReadonly } from "../util/deep-readonly";
import type { ModelDocument } from "./document";
import { parseModelNotebookStructure } from "./parse-structure";

export interface RichTextCellData {
    readonly kind: "rich-text";
    readonly id: string;
    readonly content: RichTextContent | undefined;
}

export interface ObjectCellData<O extends ObjectType = ObjectType> {
    /** ID of the stored judgment, distinct from the notebook cell ID. */
    readonly generatorId: string;
    readonly kind: "object";
    readonly id: string;
    readonly type: O;
    readonly label: string | undefined;
}

export interface MorphismCellData<M extends MorphismType = MorphismType> {
    /** ID of the stored judgment, distinct from the notebook cell ID. */
    readonly generatorId: string;
    readonly kind: "morphism";
    readonly id: string;
    readonly type: M;
    readonly label: string | undefined;
    readonly from: ObjectCellData | null | undefined;
    readonly to: ObjectCellData | null | undefined;
}

export type EquationSideData = ObjectCellData | ReadonlyArray<MorphismCellData | null>;

export interface EquationCellData {
    /** ID of the stored judgment, distinct from the notebook cell ID. */
    readonly generatorId: string;
    readonly kind: "path-equation";
    readonly id: string;
    readonly label: string | undefined;
    readonly lhs: EquationSideData;
    readonly rhs: EquationSideData;
}

export type CellData = RichTextCellData | ObjectCellData | MorphismCellData | EquationCellData;

/** Notebook data: metadata and every cell, in order. */
export interface ModelNotebookData {
    readonly type: "model";
    readonly name: string;
    readonly theory: string;
    readonly cells: readonly CellData[];
}

type NotebookParseResult = Result<WithIssues<ModelNotebookData>, ReadonlyArray<StructuralIssue>>;

const dataCache = new WeakMap<DeepReadonly<object>, NotebookParseResult>();
const emptyData: ModelNotebookData = { type: "model", name: "", theory: "", cells: [] };

/** Read notebook data. Returns an empty notebook on fatal envelope damage. */
export function getNotebookData<Handle, Version>(
    store: DocumentStore<Handle, Version>,
    handle: Handle,
): ModelNotebookData {
    const result = parseNotebookData(store.getDocumentSnapshot(handle));
    return result.tag === "Err" ? emptyData : result.content.value;
}

/** Parse directly from a raw immutable snapshot. */
export function parseNotebookData(snapshot: DeepReadonly<object>): NotebookParseResult {
    let result = dataCache.get(snapshot);
    if (result === undefined) {
        result = parseNotebookDataValue(snapshot);
        dataCache.set(snapshot, result);
    }
    return result;
}

export function shapeHasCell(shape: Shape, cell: CellData): boolean {
    switch (cell.kind) {
        case "rich-text":
            return shape.informal?.some((type) => type.kind === "rich-text") === true;
        case "object":
            return findObjectType(shape, cell.type.obType) !== undefined;
        case "morphism":
            return findMorphismType(shape, cell.type.morType) !== undefined;
        case "path-equation":
            return shape.supportsEquations === true;
        default:
            return assertExhaustive(cell["kind"]);
    }
}

function parseNotebookDataValue(document: DeepReadonly<object>): NotebookParseResult {
    if (!("type" in document) || document.type !== "model") {
        return { tag: "Err", content: [{ message: "Expected a model document", path: ["type"] }] };
    }
    const result = parseModelNotebookStructure(document as DeepReadonly<ModelDocument>);
    return {
        tag: "Ok",
        content: {
            value: buildNotebookData(result.value),
            issues: result.issues,
        },
    };
}

function buildNotebookData(document: StructurallyValid<ModelDocument>): ModelNotebookData {
    const { cellContents, cellOrder } = document.notebook;
    const cells = new Map<string, string>();
    for (const id of cellOrder) {
        const cell = cellContents[id]!;
        if (
            cell.tag === "formal" &&
            (cell.content.tag === "object" || cell.content.tag === "morphism")
        ) {
            const key = cell.content.id;
            if (!cells.has(key)) {
                cells.set(key, id);
            }
        }
    }
    const cellData = new Map<string, CellData>();

    function cellOf(id: string): CellData | undefined {
        const existing = cellData.get(id);
        if (existing) {
            return existing;
        }
        const cell = cellContents[id];
        const built = cell === undefined ? undefined : buildCellData(id, cell);
        if (built) {
            cellData.set(id, built);
        }
        return built;
    }
    // TODO: Non-basic objects (`App`, `List`, `Tabulated`) read as null; the
    // data model has no representation for them yet. Likewise, references to
    // cells of instantiated models (`instantiation` judgments) do not
    // resolve to a local cell and read as null
    const objectFromOb = (ob: DeepReadonly<Ob> | null): ObjectCellData | null => {
        if (ob?.tag !== "Basic") {
            return null;
        }
        const cellId = cells.get(ob.content);
        const resolved = cellId === undefined ? undefined : cellOf(cellId);
        return resolved?.kind === "object" ? resolved : null;
    };
    const morphismFromId = (id: string): MorphismCellData | null => {
        const cellId = cells.get(id);
        const resolved = cellId === undefined ? undefined : cellOf(cellId);
        return resolved?.kind === "morphism" ? resolved : null;
    };

    function decodeEquationSide(side: DeepReadonly<Mor> | null): EquationSideData {
        if (side === null) {
            return [];
        }
        if (side.tag === "Composite" && side.content.tag === "Id") {
            return objectFromOb(side.content.content) ?? [null];
        }
        const mors =
            side.tag === "Composite" && side.content.tag === "Seq" ? side.content.content : [side];
        return mors.map((mor) => (mor.tag === "Basic" ? morphismFromId(mor.content) : null));
    }

    function buildCellData(
        id: string,
        cell: DeepReadonly<ModelDocument["notebook"]["cellContents"][string]>,
    ): CellData | undefined {
        if (cell.tag === "rich-text") {
            const content = cell.content;
            return {
                kind: "rich-text",
                id,
                content: structuredClone(content) as RichTextContent,
            };
        }
        const decl = cell.content;
        const label = decl.name;
        const generatorId = decl.id;
        switch (decl.tag) {
            case "object":
                return {
                    kind: "object",
                    id,
                    generatorId,
                    type: { kind: "object", obType: structuredClone(decl.obType) as ObType },
                    label,
                };
            case "morphism":
                return {
                    kind: "morphism",
                    id,
                    generatorId,
                    type: {
                        kind: "morphism",
                        morType: structuredClone(decl.morType) as MorType,
                    },
                    label,
                    from: objectFromOb(decl.dom),
                    to: objectFromOb(decl.cod),
                };
            case "equation":
                return {
                    kind: "path-equation",
                    id,
                    generatorId,
                    label,
                    lhs: decodeEquationSide(decl.lhs),
                    rhs: decodeEquationSide(decl.rhs),
                };
            case "instantiation":
                // TODO: instantiation cells
                return undefined;
            default:
                assertExhaustive(decl["tag"]);
        }
    }

    const ordered: CellData[] = [];
    for (const id of cellOrder) {
        const cell = cellOf(id);
        if (cell) {
            ordered.push(cell);
        }
    }
    return { type: "model", name: document.name, theory: document.theory, cells: ordered };
}
