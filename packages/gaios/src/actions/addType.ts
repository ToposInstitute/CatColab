import type { DocHandle } from "@automerge/automerge-repo";
import { z } from "zod";
import { v7 } from "uuid";
import type { ModelDoc } from "../model_datatype";

export const addTypeAction = {
    type: "patchwork:action" as const,
    id: "catcolab-add-type",
    name: "Add Type",
    icon: "Box",
    supportedDataTypes: ["catcolab-model"],
    module: {
        argsSchema: () => {
            return z.object({
                name: z
                    .string()
                    .optional()
                    .describe("Name/label for the type"),
                position: z
                    .enum(["start", "end"])
                    .optional()
                    .describe("Where to insert the cell (default: end)"),
            });
        },
        default: (
            handle: DocHandle<ModelDoc>,
            _repo: unknown,
            args: { name?: string; position?: "start" | "end" },
        ) => {
            const cellId = v7();
            const objectId = v7();

            const cell = {
                tag: "formal" as const,
                id: cellId,
                content: {
                    tag: "object" as const,
                    id: objectId,
                    name: args.name ?? "",
                    obType: { tag: "Basic" as const, content: "Object" },
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

            return { cellId, objectId };
        },
    },
};
