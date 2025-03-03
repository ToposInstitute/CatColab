import type { MappedSchemaSpec } from "@automerge/prosemirror";
import type { BlockMarker } from "@automerge/prosemirror/dist/types";
import type { Node } from "prosemirror-model";
import { next as am } from "@automerge/automerge/slim";

export const katexSchema: MappedSchemaSpec = {
    nodes: {
        doc: {
            content: "block+"
        },
        paragraph: {
            content: "inline*",
            group: "block",
            parseDOM: [{ tag: "p" }],
            toDOM() { return ["p", 0]; }
        },
        math_inline: {               // important!
            automerge: {
                block: "math_inline",
                // isEmbed: true,
                // attrParsers: {
                //     fromAutomerge: (block: BlockMarker) => ({
                //         refid: block.attrs.refid,
                //     }),
                //     fromProsemirror: (node: Node) =>{
                //         console.log("from prosemirror ", node)
                //         return {refid: node.attrs.refid ? new am.RawString(node.attrs.refid) : null};
                //     },
                // },
            },
            group: "inline math",
            content: "text*",        // important!
            inline: true,            // important!
            atom: true,              // important!
            toDOM: () => ["math-inline", { class: "math-node" }, 0],
            parseDOM: [{
                tag: "math-inline"   // important!
            }]
        },
        math_display: {              // important!
            automerge: {
                block: "math_display",
            },
            group: "block math",
            content: "text*",        // important!
            atom: true,              // important!
            code: true,              // important!
            toDOM: () => ["math-display", { class: "math-node" }, 0],
            parseDOM: [{
                tag: "math-display"  // important!
            }]
        },
        text: {
            group: "inline"
        }
    },
};
