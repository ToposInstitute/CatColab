import type { Prop } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";

import { type MappedSchemaSpec, SchemaAdapter, init } from "@automerge/prosemirror";
import { baseKeymap, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { MarkType, NodeType, Schema } from "prosemirror-model";
import {
    type Command,
    EditorState,
    NodeSelection,
    Plugin,
    type Transaction,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { Component, createEffect, createSignal, type JSX, onCleanup, Show } from "solid-js";
import { useDocHandleReady } from "../../api/document";

import "katex/dist/katex.min.css";
import "@benrbray/prosemirror-math/dist/prosemirror-math.css";
import "prosemirror-view/style/prosemirror.css";
import "./rich_text_editor.css";
import { useApi } from "../../api";
import { RefIdView } from "./ref_id_view";

import {
    makeBlockMathInputRule,
    makeInlineMathInputRule,
    mathPlugin,
    mathSerializer,
    REGEX_BLOCK_MATH_DOLLARS,
    REGEX_INLINE_MATH_DOLLARS,
} from "@benrbray/prosemirror-math";
import { inputRules } from "prosemirror-inputrules";

import Bold from "lucide-solid/icons/bold";
import Braces from "lucide-solid/icons/braces";
import Italic from "lucide-solid/icons/italic";
import Link from "lucide-solid/icons/link";
import List from "lucide-solid/icons/list";
import ListOrdered from "lucide-solid/icons/list-ordered";
import Heading1 from "lucide-solid/icons/heading-1";
import Heading2 from "lucide-solid/icons/heading-2";
import Heading3 from "lucide-solid/icons/heading-3";
import Heading4 from "lucide-solid/icons/heading-4";
import Heading5 from "lucide-solid/icons/heading-5";
import Heading6 from "lucide-solid/icons/heading-6";
import TextQuote from "lucide-solid/icons/text-quote";
import Indent from "lucide-solid/icons/indent";
import Outdent from "lucide-solid/icons/outdent";
import Image from "lucide-solid/icons/image";
import { type CustomSchema, proseMirrorAutomergeInit } from "./schema";
import { insertMathDisplayCmd, turnSelectionIntoBlockquote } from "./commands";
import { Dialog } from "../dialog";
import LinkForm from "./link_form";
import { FootnoteView } from "./footnote_view";

/** Optional props for `RichTextEditor` component.
 */
export type RichTextEditorOptions = {
    id?: unknown;
    // this is actually an init callback that returns the view
    ref?: (ref: EditorView) => void;
    placeholder?: string;

    deleteBackward?: () => void;
    deleteForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;

    onFocus?: () => void;
};

type MarkStates = {
    isBoldActive: boolean;
    isEmActive: boolean;
};

/** Rich text editor combining Automerge and ProseMirror.

Adapted from:

- https://github.com/automerge/prosemirror-quickstart/
- https://github.com/automerge/automerge-prosemirror/tree/main/playground/
 */
export const RichTextEditor = (
    props: {
        handle: DocHandle<unknown>;
        path: Prop[];
    } & RichTextEditorOptions,
) => {
    let editorRoot!: HTMLDivElement;

    const [menuControls, setMenuControls] = createSignal<MenuControls>({
        onBoldClicked: null,
        onItalicClicked: null,
        onLinkClicked: null,
        onBlockQuoteClicked: null,
        onToggleOrderedList: null,
        onToggleNumberedList: null,
        onIncreaseIndent: null,
        onDecreaseIndent: null,
        onHeadingClicked: null,
        onImageClicked: null,
        onCodeClicked: null,
    });

    const [markStates, setMarkStates] = createSignal<MarkStates>({
        isBoldActive: false,
        isEmActive: false,
    });

    const [linkModalOpen, setLinkModalOpen] = createSignal(false);

    const api = useApi();
    const isReady = useDocHandleReady(() => props.handle);

    createEffect(() => {
        // NOTE: Make the effect depend on the given ID to ensure that this
        // component updates when the Automerge handle and path both stay the
        // same but the path refers to a different object in the document.
        props.id;

        if (!isReady()) {
            return;
        }

        const { schema, pmDoc, automergePlugin } = proseMirrorAutomergeInit(
            props.handle,
            props.path,
        );

        const inlineMathInputRule = makeInlineMathInputRule(
            REGEX_INLINE_MATH_DOLLARS,
            schema.nodes.math_inline!,
        );
        const blockMathInputRule = makeBlockMathInputRule(
            REGEX_BLOCK_MATH_DOLLARS,
            schema.nodes.math_display!,
        );

        const plugins: Plugin[] = [
            keymap(richTextEditorKeymap(schema, props)),
            keymap(baseKeymap),
            ...(props.placeholder ? [placeholder(props.placeholder)] : []),
            automergePlugin,
            mathPlugin,
            inputRules({ rules: [inlineMathInputRule, blockMathInputRule] }),
        ];

        const state = EditorState.create({ schema, plugins, doc: pmDoc });
        const view = new EditorView(editorRoot, {
            state,
            dispatchTransaction: (tx: Transaction) => {
                // XXX: It appears that automerge-prosemirror can dispatch
                // transactions even after the view has been destroyed.
                if (view.isDestroyed) {
                    return;
                }

                const newState = view.state.apply(tx);
                setMarkStates(activeMarks(newState, schema));
                view.updateState(newState);
            },
            handleDOMEvents: {
                focus: () => {
                    props.onFocus?.();
                    return false;
                },
            },
            nodeViews: {
                catcolabref(node, view, getPos) {
                    return new RefIdView(node, view, getPos, api);
                },

                // footnote(node, view, getPos) {
                //     return new FootnoteView(node, view, getPos);
                // },
            },
            clipboardTextSerializer: (slice) => {
                return mathSerializer.serializeSlice(slice);
            },
        });

        if (props.ref) {
            props.ref(view);
        }

        setMarkStates(activeMarks(view.state, schema));

        setMenuControls({
            onBoldClicked: () => toggleMark(schema.marks.strong)(view.state, view.dispatch),
            onItalicClicked: () => toggleMark(schema.marks.em)(view.state, view.dispatch),
            onLinkClicked: () => {
                setLinkModalOpen(true);
            },
            onBlockQuoteClicked: () => turnSelectionIntoBlockquote(view.state, view.dispatch, view),
            onToggleOrderedList: null,
            onToggleNumberedList: null,
            onIncreaseIndent: null,
            onDecreaseIndent: null,
            onHeadingClicked: (level: number) => {
                const { $from } = view.state.selection;
                if ($from.node().type.name === "heading" && $from.node().attrs.level === level) {
                    setBlockType(view.state.schema.nodes.paragraph!)(
                        view.state,
                        view.dispatch,
                        view,
                    );
                } else {
                    setBlockType(view.state.schema.nodes.heading!, { level })(
                        view.state,
                        view.dispatch,
                        view,
                    );
                }
            },
            onImageClicked: null,
            onCodeClicked: null,
            onUrlChosen: (url: string) => {
                const { from, to } = view.state.selection;
                const tr = view.state.tr;
                tr.addMark(from, to, schema.marks.link.create({ href: url, title: "" }));
                view.dispatch(tr);
                setLinkModalOpen(false);
            },
        });

        onCleanup(() => view.destroy());
    });

    return (
        <div id="prosemirror">
            <MenuBar {...menuControls()} {...markStates()} />
            <div id="rich-text-editor" ref={editorRoot} />

            <Dialog open={linkModalOpen()} onOpenChange={setLinkModalOpen} title="Link">
                <LinkForm onUrlChosen={menuControls().onUrlChosen!} />
            </Dialog>
        </div>
    );
};

function activeMarks(state: EditorState, schema: CustomSchema): MarkStates {
    const isBoldActive = markActive(state, schema.marks.strong);
    const isEmActive = markActive(state, schema.marks.em);

    return { isBoldActive, isEmActive };
}

function markActive(state: EditorState, type: MarkType) {
    const { from, $from, to, empty } = state.selection;
    if (empty) {
        return !!type.isInSet(state.storedMarks || $from.marks());
    } else {
        return state.doc.rangeHasMark(from, to, type);
    }
}

export function insertMathInlineCmd(mathNodeType: NodeType, initialText = ""): Command {
    return (state: EditorState, dispatch: ((tr: Transaction) => void) | undefined) => {
        const { $from } = state.selection,
            index = $from.index();
        if (!$from.parent.canReplaceWith(index, index, mathNodeType)) {
            return false;
        }

        if (dispatch) {
            const mathNode = mathNodeType.create(
                {},
                initialText ? state.schema.text(initialText) : null,
            );

            let tr = state.tr.replaceSelectionWith(mathNode);
            tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos));

            dispatch(tr);
        }

        return true;
    };
}

function insertCatcolabRef(nodeType: NodeType): Command {
    return (state, dispatch) => {
        const { $from } = state.selection;
        const index = $from.index();
        if (!$from.parent.canReplaceWith(index, index, nodeType)) {
            return false;
        }
        if (dispatch) {
            const n = nodeType.create();
            const tr = state.tr.replaceSelectionWith(n);
            dispatch(tr);
        }
        return true;
    };
}
function insertFootnote(nodeType: NodeType): Command {
    return (state, dispatch) => {
        const { $from } = state.selection;
        // const index = $from.index();
        // if (!$from.parent.canReplaceWith(index, index, nodeType)) {
        //     return false;
        // }
        if (dispatch) {
            const n = nodeType.create();
            const tr = state.tr.replaceSelectionWith(n);
            dispatch(tr);
        }
        return true;
    };
}

function richTextEditorKeymap(schema: CustomSchema, props: RichTextEditorOptions) {
    const bindings: { [key: string]: Command } = {};

    bindings["Mod-b"] = toggleMark(schema.marks.strong);
    // bindings["Mod-i"] = toggleMark(schema.marks.em);
    // bindings["Mod-i"] = insertCatcolabRef(schema.nodes.catcolabref);
    bindings["Mod-x"] = insertFootnote(schema.nodes.footnote);
    bindings["Mod-m"] = insertMathDisplayCmd(schema.nodes.math_display);
    bindings["Mod-i"] = insertMathInlineCmd(schema.nodes.math_inline);

    if (props.deleteBackward) {
        bindings["Backspace"] = doIfEmpty(props.deleteBackward);
    }
    if (props.deleteForward) {
        bindings["Delete"] = doIfEmpty(props.deleteForward);
    }
    if (props.exitUp) {
        bindings["ArrowUp"] = doIfAtTop(props.exitUp);
    }
    if (props.exitDown) {
        bindings["ArrowDown"] = doIfAtBottom(props.exitDown);
    }

    return bindings;
}

/** ProseMirror command invoked if the document is empty.
 */
function doIfEmpty(callback: (dispatch: (tr: Transaction) => void) => void): Command {
    return (state, dispatch?) => {
        if (hasContent(state)) {
            return false;
        }
        dispatch && callback(dispatch);
        return true;
    };
}

/** ProseMirror command invoked if the cursor is at the top of the document.
 */
function doIfAtTop(callback: (dispatch: (tr: Transaction) => void) => void): Command {
    return (state, dispatch?, view?) => {
        const sel = state.selection;
        if (
            !(
                sel.empty &&
                sel.$anchor.parent === state.doc.firstChild &&
                view &&
                view.endOfTextblock("up")
            )
        ) {
            return false;
        }
        dispatch && callback(dispatch);
        return true;
    };
}

/** ProseMirror command invoked if the cursor is at the bottom of the document.
 */
function doIfAtBottom(callback: (dispatch: (tr: Transaction) => void) => void): Command {
    return (state, dispatch?, view?) => {
        const sel = state.selection;
        if (
            !(
                sel.empty &&
                sel.$anchor.parent === state.doc.lastChild &&
                view &&
                view.endOfTextblock("down")
            )
        ) {
            return false;
        }
        dispatch && callback(dispatch);
        return true;
    };
}

/** Placeholder text plugin for ProseMirror.

Source:

- https://discuss.prosemirror.net/t/how-to-input-like-placeholder-behavior/705
- https://gist.github.com/amk221/1f9657e92e003a3725aaa4cf86a07cc0
 */
function placeholder(text: string) {
    const update = (view: EditorView) => {
        if (hasContent(view.state)) {
            view.dom.removeAttribute("data-placeholder");
        } else {
            view.dom.setAttribute("data-placeholder", text);
        }
    };

    return new Plugin({
        view(view) {
            update(view);

            return { update };
        },
    });
}

const hasContent = (state: EditorState) => {
    const doc = state.doc;
    return doc.textContent || (doc.firstChild && doc.firstChild.content.size > 0);
};

type MenuControls = {
    onBoldClicked: (() => void) | null;
    onItalicClicked: (() => void) | null;
    onLinkClicked: (() => void) | null;
    onBlockQuoteClicked: (() => void) | null;
    onToggleOrderedList: (() => void) | null;
    onToggleNumberedList: (() => void) | null;
    onIncreaseIndent: (() => void) | null;
    onDecreaseIndent: (() => void) | null;
    onHeadingClicked: ((level: number) => void) | null;
    onImageClicked: (() => void) | null;
    onCodeClicked: (() => void) | null;
    onUrlChosen: ((url: string) => void) | null;
};

export function MenuBar(props: MenuControls & MarkStates) {
    return (
        <div id="menubar" class="menubar">
            <div class="row">
                <Show when={props.onBoldClicked}>
                    <button
                        id="bold"
                        onClick={props.onBoldClicked!}
                        classList={{ active: props.isBoldActive }}
                    >
                        <Bold />
                    </button>
                </Show>
                <Show when={props.onItalicClicked}>
                    <button
                        id="italic"
                        onClick={props.onItalicClicked!}
                        classList={{ active: props.isEmActive }}
                    >
                        <Italic />
                    </button>
                </Show>
                <Show when={props.onLinkClicked}>
                    <button id="link" onClick={props.onLinkClicked!}>
                        <Link />
                    </button>
                </Show>
                <Show when={props.onCodeClicked}>
                    <button onClick={props.onCodeClicked!}>
                        <Braces />
                    </button>
                </Show>
            </div>

            <Show when={props.onHeadingClicked}>
                <div class="row">
                    <button onClick={() => props.onHeadingClicked!(1)}>
                        <Heading1 />
                    </button>
                    <button onClick={() => props.onHeadingClicked!(2)}>
                        <Heading2 />
                    </button>
                    <button onClick={() => props.onHeadingClicked!(3)}>
                        <Heading3 />
                    </button>
                    <button onClick={() => props.onHeadingClicked!(4)}>
                        <Heading4 />
                    </button>
                    <button onClick={() => props.onHeadingClicked!(5)}>
                        <Heading5 />
                    </button>
                    <button onClick={() => props.onHeadingClicked!(6)}>
                        <Heading6 />
                    </button>
                </div>
            </Show>

            <div class="row">
                <Show when={props.onBlockQuoteClicked}>
                    <CaptionedButton caption="Blockquote" onClick={props.onBlockQuoteClicked!}>
                        <TextQuote />
                    </CaptionedButton>
                </Show>
                <Show when={props.onToggleNumberedList}>
                    <CaptionedButton caption="Numbered list" onClick={props.onToggleNumberedList!}>
                        <ListOrdered />
                    </CaptionedButton>
                </Show>
                <Show when={props.onToggleOrderedList}>
                    <CaptionedButton caption="Bullet list" onClick={props.onToggleOrderedList!}>
                        <List />
                    </CaptionedButton>
                </Show>
                <Show when={props.onIncreaseIndent}>
                    <CaptionedButton caption="Indent" onClick={props.onIncreaseIndent!}>
                        <Indent />
                    </CaptionedButton>
                </Show>
                <Show when={props.onDecreaseIndent}>
                    <CaptionedButton caption="Outdent" onClick={props.onDecreaseIndent!}>
                        <Outdent />
                    </CaptionedButton>
                </Show>
                <Show when={props.onImageClicked}>
                    <CaptionedButton caption="Image" onClick={props.onImageClicked!}>
                        <Image />
                    </CaptionedButton>
                </Show>
            </div>
        </div>
    );
}

function CaptionedButton({
    caption,
    onClick,
    children,
}: { caption: string; onClick: () => void; children: JSX.Element }) {
    return (
        <div class="captionedButton">
            <button onClick={onClick}>{children}</button>
            <p>{caption}</p>
        </div>
    );
}
