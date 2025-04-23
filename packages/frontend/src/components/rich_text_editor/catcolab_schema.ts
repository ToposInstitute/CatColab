import type { Node, NodeSpec } from "prosemirror-model";

import { next as am } from "@automerge/automerge/slim";
import type { MappedSchemaSpec } from "@automerge/prosemirror";
import type { BlockMarker } from "@automerge/prosemirror/dist/types";

export const catcolabSchema = {
    nodes: {
        // TODO: we probably want a better naming scheme
        // TODO: are capitals allowed?
        catcolabref: {
            attrs: {
                refid: {
                    default: null,
                },
            },
            atom: true,
            inline: true,
            group: "inline",
            draggable: true,
            automerge: {
                block: "catcolabref",
                isEmbed: true,
                attrParsers: {
                    fromAutomerge: (block: BlockMarker) => ({
                        refid: block.attrs.refid,
                    }),
                    fromProsemirror: (node: Node) => ({
                        refid: node.attrs.refid ? new am.RawString(node.attrs.refid) : null,
                    }),
                },
            },
            toDOM: (node: Node) => [
                "span",
                {
                    catcolabrefid: node.attrs.refid,
                },
            ],
            // TODO: using the same name for the attribute and the class is probably bad, we should probably only use the attribute
            parseDOM: [
                {
                    tag: "span.catcolabrefid",
                    getAttrs: (dom: HTMLElement) => {
                        return dom.getAttribute("catcolabrefid");
                    },
                },
            ],
        } as NodeSpec,
        footnote: {
            // attrs: {
            //     refid: {
            //         default: null,
            //     },
            // },
            atom: true,
            inline: true,
            group: "inline",
            draggable: true,
            automerge: {
                block: "footnote",
                isEmbed: true,
                // attrParsers: {
                //     fromAutomerge: (block: BlockMarker) => ({
                //         refid: block.attrs.refid,
                //     }),
                //     fromProsemirror: (node: Node) => ({
                //         refid: node.attrs.refid ? new am.RawString(node.attrs.refid) : null,
                //     }),
                // },
            },
            toDOM: () => ["div", { class: "math-node2" }, 0],
            parseDOM: [
                {
                    tag: "div.math-node2",
                },
            ],
        } as NodeSpec,
        // heading: {
        //     automerge: {
        //         block: "something",
        //     },
        //     content: "text*",
        //     group: "inline",
        //     defining: true,
        //     parseDOM: [
        //         { tag: "h1", attrs: { level: 1 } },
        //         { tag: "h2", attrs: { level: 2 } },
        //         { tag: "h3", attrs: { level: 3 } },
        //         { tag: "h4", attrs: { level: 4 } },
        //         { tag: "h5", attrs: { level: 5 } },
        //         { tag: "h6", attrs: { level: 6 } },
        //     ],
        //     toDOM(node) {
        //         return [`h${node.attrs.level}`, 0];
        //     },
        // },
        // footnode: {
        //     automerge: {
        //         block: "footnote",
        //         isEmbed: true,
        //     },
        //     group: "inline",
        //     content: "text*",
        //     inline: true,
        //     // This makes the view treat the node as a leaf, even though it
        //     // technically has content
        //     atom: true,
        //     toDOM: () => ["span", { test: "thingy" }],
        //     parseDOM: [{ tag: "span.thingy" }],
        // },
    },
} satisfies MappedSchemaSpec;
