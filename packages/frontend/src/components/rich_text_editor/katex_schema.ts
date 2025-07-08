import type { MappedSchemaSpec } from "@automerge/prosemirror";
import {
    defaultBlockMathParseRules,
    defaultInlineMathParseRules,
} from "@benrbray/prosemirror-math";

export const katexSchema = {
    nodes: {
        math_inline: {
            automerge: {
                block: "math_inline",
                isEmbed: true,
            },
            group: "inline",
            content: "text*",
            inline: true,
            atom: true,
            toDOM: () => ["math-inline", { class: "math-node" }, 0],
            parseDOM: [
                {
                    tag: "math-inline",
                },
                ...defaultInlineMathParseRules,
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
                ...defaultBlockMathParseRules,
            ],
        },
    },
} satisfies MappedSchemaSpec;
