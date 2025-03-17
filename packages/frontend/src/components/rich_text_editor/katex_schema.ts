import type { MappedSchemaSpec } from "@automerge/prosemirror";

export const katexSchema: MappedSchemaSpec = {
    nodes: {
        math_inline: {
            automerge: {
                block: "math_inline",
            },
            group: "inline math",
            content: "text*",
            inline: true,
            atom: true,
            toDOM: () => ["math-inline", { class: "math-node" }, 0],
            parseDOM: [
                {
                    tag: "math-inline",
                },
            ],
        },
        math_display: {
            automerge: {
                block: "math_display",
            },
            group: "block math",
            content: "text*",
            atom: true,
            code: true,
            toDOM: () => ["math-display", { class: "math-node" }, 0],
            parseDOM: [
                {
                    tag: "math-display",
                },
            ],
        },
    },
};
