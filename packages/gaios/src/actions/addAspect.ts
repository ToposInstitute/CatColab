import type { DocHandle } from "@automerge/automerge-repo";
import { z } from "zod";
import { v7 } from "uuid";
import type { ModelDoc } from "../model_datatype";

// UUID v7 pattern (simplified check)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Find an object by name or ID.
 * If the value looks like a UUID, return it directly.
 * Otherwise, search for an object cell with a matching name.
 */
function findObjectByNameOrId(doc: ModelDoc, value: string): string | null {
    // If it looks like a UUID, return it directly
    if (UUID_PATTERN.test(value)) {
        return value;
    }

    // Search for an object with matching name
    for (const cellId of doc.notebook.cellOrder) {
        const cell = doc.notebook.cellContents[cellId];
        if (
            cell &&
            cell.tag === "formal" &&
            cell.content &&
            typeof cell.content === "object" &&
            "tag" in cell.content &&
            cell.content.tag === "object" &&
            "name" in cell.content &&
            "id" in cell.content &&
            cell.content.name === value
        ) {
            return cell.content.id as string;
        }
    }

    return null;
}

export const addAspectAction = {
    type: "patchwork:action" as const,
    id: "catcolab-add-aspect",
    name: "Add Aspect",
    icon: "ArrowRight",
    supportedDataTypes: ["catcolab-model"],
    module: {
        argsSchema: () => {
            return z.object({
                name: z
                    .string()
                    .optional()
                    .describe("Name/label for the aspect"),
                dom: z
                    .string()
                    .optional()
                    .describe(
                        "Domain object - can be either a UUID or a name (will look up by name if not a valid UUID)",
                    ),
                cod: z
                    .string()
                    .optional()
                    .describe(
                        "Codomain object - can be either a UUID or a name (will look up by name if not a valid UUID)",
                    ),
                position: z
                    .enum(["start", "end"])
                    .optional()
                    .describe("Where to insert the cell (default: end)"),
            });
        },
        default: (
            handle: DocHandle<ModelDoc>,
            _repo: unknown,
            args: {
                name?: string;
                dom?: string;
                cod?: string;
                position?: "start" | "end";
            },
        ) => {
            const cellId = v7();
            const morphismId = v7();

            let resolvedDomId: string | null = null;
            let resolvedCodId: string | null = null;

            // We need to read the current doc to look up objects by name
            const currentDoc = handle.docSync();
            if (currentDoc) {
                if (args.dom) {
                    resolvedDomId = findObjectByNameOrId(currentDoc, args.dom);
                }
                if (args.cod) {
                    resolvedCodId = findObjectByNameOrId(currentDoc, args.cod);
                }
            }

            const cell = {
                tag: "formal" as const,
                id: cellId,
                content: {
                    tag: "morphism" as const,
                    id: morphismId,
                    name: args.name ?? "",
                    morType: {
                        tag: "Hom" as const,
                        content: { tag: "Basic" as const, content: "Object" },
                    },
                    dom: resolvedDomId
                        ? { tag: "Basic" as const, content: resolvedDomId }
                        : null,
                    cod: resolvedCodId
                        ? { tag: "Basic" as const, content: resolvedCodId }
                        : null,
                },
            };

            handle.change((doc) => {
                const position = args.position ?? "end";

                if (position === "start") {
                    doc.notebook.cellOrder.unshift(cellId);
                } else {
                    doc.notebook.cellOrder.push(cellId);
                }

                doc.notebook.cellContents[cellId] = cell;
            });

            return {
                cellId,
                morphismId,
                resolvedDom: resolvedDomId,
                resolvedCod: resolvedCodId,
            };
        },
    },
};
