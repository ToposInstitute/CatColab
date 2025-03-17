import type { Node, NodeSpec } from "prosemirror-model";

import { next as am } from "@automerge/automerge/slim";
import type { MappedSchemaSpec } from "@automerge/prosemirror";
import type { BlockMarker } from "@automerge/prosemirror/dist/types";

export const catcolabSchema: MappedSchemaSpec = {
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
    },
};
