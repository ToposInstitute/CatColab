import type { MappedSchemaSpec } from "@automerge/prosemirror";
import type { BlockMarker } from "@automerge/prosemirror/dist/types";
import { defaultBlockMathParseRules } from "@benrbray/prosemirror-math";
import type { Node } from "prosemirror-model";

export const katexSchema = {
    nodes: {
        math_inline: {
            automerge: {
                block: "math_inline",
                isEmbed: true,
                attrParsers: {
                    fromProsemirror: (node: Node) => ({ tex: node.attrs.tex || "" }),
                    fromAutomerge: (block: BlockMarker) => ({
                        tex: block.attrs.tex?.toString() || "",
                    }),
                },
            },
            attrs: { tex: { default: "" } },
            group: "inline",
            inline: true,
            atom: true,
            toDOM(node: Node) {
                return ["math-inline", { class: "math-node", "data-tex": node.attrs.tex }];
            },
            parseDOM: [
                {
                    tag: "math-inline",
                    getAttrs(dom: HTMLElement) {
                        return { tex: dom.getAttribute("data-tex") || dom.textContent || "" };
                    },
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
                ...defaultBlockMathParseRules,
            ],
        },
    },
} satisfies MappedSchemaSpec;
