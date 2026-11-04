import type { Ob } from "catcolab-document-types";
import type { MorphismEndpoint } from "../shape";
import { isArray } from "../util/is-array";
import { assertListModality } from "./assert-list-modality";
import type { CellData, ModelNotebookData } from "./data";
import type { EndpointData } from "./endpoint";
import type { CellRef } from "./update";

/** Runtime names for the discriminants on notebook cells. */
export const CellKind = {
    RichText: "rich-text",
    Object: "object",
    Morphism: "morphism",
    PathEquation: "path-equation",
} as const satisfies Record<string, CellData["kind"]>;

export function obFromObjectCell(data: ModelNotebookData, endpoint: CellRef | null): Ob | null {
    if (!endpoint) {
        return null;
    }
    if (isArray(endpoint)) {
        throw new Error("Expected a scalar object endpoint.");
    }
    const cell = data.cells.find((cell) => cell.id === endpoint.id);
    if (!cell) {
        throw new Error(`Cell ${endpoint.id} does not exist.`);
    }
    if (cell.kind !== "object") {
        throw new Error(`Cell ${endpoint.id} is not an object.`);
    }
    return { tag: "Basic", content: cell.generatorId };
}

export function obFromMorphismEndpoint(
    data: ModelNotebookData,
    endpoint: MorphismEndpoint | undefined,
    value: EndpointData<CellRef> | null,
): Ob | null {
    if (value === null) {
        return null;
    }
    if (endpoint && "apply" in endpoint) {
        assertListModality(endpoint.modality);
        if (!isArray(value)) {
            throw new Error("Expected a list object endpoint.");
        }
        return {
            tag: "App",
            content: {
                op: endpoint.apply,
                ob: {
                    tag: "List",
                    content: {
                        modality: endpoint.modality,
                        objects: value.map((cell) => obFromObjectCell(data, cell)),
                    },
                },
            },
        };
    }
    if (isArray(value)) {
        throw new Error("Expected a scalar object endpoint.");
    }
    return obFromObjectCell(data, value);
}
