import type { DocHandle } from "@automerge/automerge-repo";
import { z } from "zod";
import { v7 } from "uuid";
import type { ModelDoc } from "../model_datatype";

export const addTextCellAction = {
    type: "patchwork:action" as const,
    id: "catcolab-add-text-cell",
    name: "Add Text Cell",
    icon: "FileText",
    supportedDataTypes: ["catcolab-model"],
    module: {
        argsSchema: () => {
            return z.object({
                content: z
                    .string()
                    .optional()
                    .describe("Initial text content for the cell"),
                position: z
                    .enum(["start", "end"])
                    .optional()
                    .describe("Where to insert the cell (default: end)"),
            });
        },
        default: (
            handle: DocHandle<ModelDoc>,
            _repo: unknown,
            args: { content?: string; position?: "start" | "end" },
        ) => {
            const cellId = v7();
            const cell = {
                tag: "rich-text" as const,
                id: cellId,
                content: args.content ?? "",
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

            return { cellId };
        },
    },
};
