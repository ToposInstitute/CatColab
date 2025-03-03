import type {
    DOMOutputSpec,
    Mark,
    MarkSpec,
    Node,
    NodeSpec,
} from "prosemirror-model";

import { next as am } from "@automerge/automerge/slim";
import type { MappedSchemaSpec } from "@automerge/prosemirror";
import type { BlockMarker } from "@automerge/prosemirror/dist/types";

// basics
const pDOM: DOMOutputSpec = ["p", 0];
const blockquoteDOM: DOMOutputSpec = ["blockquote", 0];
const hrDOM: DOMOutputSpec = ["hr"];
const preDOM: DOMOutputSpec = ["pre", ["code", 0]];

// marks
const emDOM: DOMOutputSpec = ["em", 0];
const strongDOM: DOMOutputSpec = ["strong", 0];
const codeDOM: DOMOutputSpec = ["code", 0];

// lists
const olDOM: DOMOutputSpec = ["ol", 0];
const ulDOM: DOMOutputSpec = ["ul", 0];
const liDOM: DOMOutputSpec = ["li", 0];

export const dinos = ["stegosaurus", "triceratops", "tyrannosaurus"] as const;

export const basicSchema: MappedSchemaSpec = {
    nodes: {
        /// NodeSpec The top level document node.
        doc: {
            content: "block+",
        } as NodeSpec,

        /// A plain paragraph textblock. Represented in the DOM
        /// as a `<p>` element.
        paragraph: {
            automerge: {
                block: "paragraph",
            },
            content: "inline*",
            group: "block",
            parseDOM: [{ tag: "p" }],
            toDOM() {
                return pDOM;
            },
        } as NodeSpec,

        unknownBlock: {
            automerge: {
                unknownBlock: true,
            },
            group: "block",
            content: "block+",
            parseDOM: [{ tag: "div", attrs: { "data-unknown-block": "true" } }],
            toDOM() {
                return ["div", { "data-unknown-block": "true" }, 0];
            },
        },

        /// A blockquote (`<blockquote>`) wrapping one or more blocks.
        blockquote: {
            automerge: {
                block: "blockquote",
            },
            content: "block+",
            group: "block",
            defining: true,
            parseDOM: [{ tag: "blockquote" }],
            toDOM() {
                return blockquoteDOM;
            },
        } as NodeSpec,

        /// A horizontal rule (`<hr>`).
        horizontal_rule: {
            group: "block",
            parseDOM: [{ tag: "hr" }],
            toDOM() {
                return hrDOM;
            },
        } as NodeSpec,

        /// A heading textblock, with a `level` attribute that
        /// should hold the number 1 to 6. Parsed and serialized as `<h1>` to
        /// `<h6>` elements.
        heading: {
            automerge: {
                block: "heading",
                attrParsers: {
                    fromAutomerge: (block) => ({ level: block.attrs.level }),
                    fromProsemirror: (node) => ({ level: node.attrs.level }),
                },
            },
            attrs: { level: { default: 1 } },
            content: "inline*",
            group: "block",
            defining: true,
            parseDOM: [
                { tag: "h1", attrs: { level: 1 } },
                { tag: "h2", attrs: { level: 2 } },
                { tag: "h3", attrs: { level: 3 } },
                { tag: "h4", attrs: { level: 4 } },
                { tag: "h5", attrs: { level: 5 } },
                { tag: "h6", attrs: { level: 6 } },
            ],
            toDOM(node) {
                return [`h${node.attrs.level}`, 0];
            },
        },

        /// A code listing. Disallows marks or non-text inline
        /// nodes by default. Represented as a `<pre>` element with a
        /// `<code>` element inside of it.
        code_block: {
            automerge: {
                block: "code-block",
            },
            content: "text*",
            marks: "",
            group: "block",
            code: true,
            defining: true,
            parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
            toDOM() {
                return preDOM;
            },
        } as NodeSpec,

        /// The text node.
        text: {
            group: "inline",
        } as NodeSpec,

        /// An inline image (`<img>`) node. Supports `src`,
        /// `alt`, and `href` attributes. The latter two default to the empty
        /// string.
        image: {
            automerge: {
                block: "image",
                isEmbed: true,
                attrParsers: {
                    fromAutomerge: (block: BlockMarker) => ({
                        src: block.attrs.src?.toString() || null,
                        alt: block.attrs.alt,
                        title: block.attrs.title,
                    }),
                    fromProsemirror: (node: Node) => ({
                        src: new am.RawString(node.attrs.src),
                        alt: node.attrs.alt,
                        title: node.attrs.title,
                    }),
                },
            },
            inline: true,
            attrs: {
                src: {},
                alt: { default: null },
                title: { default: null },
            },
            group: "inline",
            draggable: true,
            parseDOM: [
                {
                    tag: "img[src]",
                    getAttrs(dom: HTMLElement) {
                        return {
                            src: dom.getAttribute("src"),
                            title: dom.getAttribute("title"),
                            alt: dom.getAttribute("alt"),
                        };
                    },
                },
            ],
            toDOM(node) {
                const { src, alt, title } = node.attrs;
                return ["img", { src, alt, title }];
            },
        } as NodeSpec,

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

            // These nodes are rendered as images with a `dino-type` attribute.
            // There are pictures for all dino types under /img/dino/.
            toDOM: (node: any) => [
                "span",
                {
                    "catcolabrefid": node.attrs.refid,
                },
            ],
            // When parsing, such an image, if its type matches one of the known
            // types, is converted to a dino node.
            parseDOM: [
                {
                    tag: "span.catcolabrefid",
                    getAttrs: (dom: any) => {
                        return dom.getAttribute("catcolabrefid");
                    },
                },
            ],
        } as NodeSpec,

        ordered_list: {
            group: "block",
            content: "list_item+",
            attrs: { order: { default: 1 } },
            parseDOM: [
                {
                    tag: "ol",
                    getAttrs(dom: HTMLElement) {
                        return {
                            order: dom.hasAttribute("start")
                                ? // biome-ignore lint/style/noNonNullAssertion: it was this way in the prosemirror example
                                  +dom.getAttribute("start")!
                                : 1,
                        };
                    },
                },
            ],
            toDOM(node) {
                return node.attrs.order === 1
                    ? olDOM
                    : ["ol", { start: node.attrs.order }, 0];
            },
        } as NodeSpec,

        bullet_list: {
            content: "list_item+",
            group: "block",
            parseDOM: [{ tag: "ul" }],
            toDOM() {
                return ulDOM;
            },
        },

        /// A list item (`<li>`) spec.
        list_item: {
            automerge: {
                block: {
                    within: {
                        ordered_list: "ordered-list-item",
                        bullet_list: "unordered-list-item",
                    },
                },
            },
            content: "paragraph block*",
            parseDOM: [{ tag: "li" }],
            toDOM() {
                return liDOM;
            },
            defining: true,
        },

        aside: {
            automerge: {
                block: "aside",
            },
            content: "block+",
            group: "block",
            defining: true,
            parseDOM: [{ tag: "aside" }],
            toDOM() {
                return ["aside", 0];
            },
        },
    },
    marks: {
        /// A link. Has `href` and `title` attributes. `title`
        /// defaults to the empty string. Rendered and parsed as an `<a>`
        /// element.
        link: {
            attrs: {
                href: {},
                title: { default: null },
            },
            inclusive: false,
            parseDOM: [
                {
                    tag: "a[href]",
                    getAttrs(dom: HTMLElement) {
                        return {
                            href: dom.getAttribute("href"),
                            title: dom.getAttribute("title"),
                        };
                    },
                },
            ],
            toDOM(node) {
                const { href, title } = node.attrs;
                return ["a", { href, title }, 0];
            },
            automerge: {
                markName: "link",
                parsers: {
                    fromAutomerge: (mark: am.MarkValue) => {
                        if (typeof mark === "string") {
                            try {
                                const value = JSON.parse(mark);
                                return {
                                    href: value.href || "",
                                    title: value.title || "",
                                };
                            } catch (e) {
                                console.warn(
                                    "failed to parse link mark as JSON"
                                );
                            }
                        }
                        return {
                            href: "",
                            title: "",
                        };
                    },
                    fromProsemirror: (mark: Mark) =>
                        JSON.stringify({
                            href: mark.attrs.href,
                            title: mark.attrs.title,
                        }),
                },
            },
        },

        /// An emphasis mark. Rendered as an `<em>` element. Has parse rules
        /// that also match `<i>` and `font-style: italic`.
        em: {
            parseDOM: [
                { tag: "i" },
                { tag: "em" },
                { style: "font-style=italic" },
                {
                    style: "font-style=normal",
                    clearMark: (m) => m.type.name === "em",
                },
            ],
            toDOM() {
                return emDOM;
            },
            automerge: {
                markName: "em",
            },
        } as MarkSpec,

        /// A strong mark. Rendered as `<strong>`, parse rules also match
        /// `<b>` and `font-weight: bold`.
        strong: {
            parseDOM: [
                { tag: "strong" },
                // This works around a Google Docs misbehavior where
                // pasted content will be inexplicably wrapped in `<b>`
                // tags with a font-weight normal.
                {
                    tag: "b",
                    getAttrs: (node: HTMLElement) =>
                        node.style.fontWeight !== "normal" && null,
                },
                {
                    style: "font-weight=400",
                    clearMark: (m) => m.type.name === "strong",
                },
                {
                    style: "font-weight",
                    getAttrs: (value: string) =>
                        /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
                },
            ],
            toDOM() {
                return strongDOM;
            },
            automerge: {
                markName: "strong",
            },
        } as MarkSpec,

        /// Code font mark. Represented as a `<code>` element.
        code: {
            parseDOM: [{ tag: "code" }],
            toDOM() {
                return codeDOM;
            },
        } as MarkSpec,
    },
};
