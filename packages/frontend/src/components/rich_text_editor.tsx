import type { Prop } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";

import { init } from "@automerge/prosemirror";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { Schema } from "prosemirror-model";
import { type Command, EditorState, Plugin, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { createEffect, onCleanup } from "solid-js";
import { useDocHandleReady } from "../api/document";

import "prosemirror-view/style/prosemirror.css";
import "./rich_text_editor.css";

/** Optional props for `RichTextEditor` component.
 */
export type RichTextEditorOptions = {
    id?: unknown;
    ref?: (ref: EditorView) => void;
    placeholder?: string;

    deleteBackward?: () => void;
    deleteForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;

    onFocus?: () => void;
    anchor?: () => void;
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

    const isReady = useDocHandleReady(() => props.handle);

    createEffect(() => {
        // NOTE: Make the effect depend on the given ID to ensure that this
        // component updates when the Automerge handle and path both stay the
        // same but the path refers to a different object in the document.
        props.id;

        if (!isReady()) {
            return;
        }

        const { schema, pmDoc, plugin } = init(props.handle, props.path);

        const plugins: Plugin[] = [
            keymap(richTextEditorKeymap(schema, props)),
            keymap(baseKeymap),
            ...(props.placeholder ? [placeholder(props.placeholder)] : []),
            plugin,
        ];

        const view = new EditorView(editorRoot, {
            state: EditorState.create({ schema, plugins, doc: pmDoc }),
            dispatchTransaction: (tx: Transaction) => {
                // XXX: It appears that automerge-prosemirror can dispatch
                // transactions even after the view has been destroyed.
                !view.isDestroyed && view.updateState(view.state.apply(tx));
            },
            handleDOMEvents: {
                focus: () => {
                    props.onFocus?.();
                    return false;
                },
            },
        });
        if (props.ref) {
            props.ref(view);
        }

        onCleanup(() => view.destroy());
    });

    return <div class="rich-text-editor" ref={editorRoot} />;
};

function richTextEditorKeymap(schema: Schema, props: RichTextEditorOptions) {
    const bindings: { [key: string]: Command } = {};
    if (schema.marks.strong) {
        bindings["Mod-b"] = toggleMark(schema.marks.strong);
    }
    if (schema.marks.em) {
        bindings["Mod-i"] = toggleMark(schema.marks.em);
    }
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

export function addLink(view: EditorView, url: string) {
    const { state } = view;
    const { schema, selection } = state;

    if (!schema.marks.link || selection.empty) {
        return false;
    }

    const attrs = {
        href: url.startsWith("http") ? url : `https://${url}`,
        title: selection.content().content.textBetween(0, selection.content().size),
    };

    const tr = state.tr.addMark(selection.from, selection.to, schema.marks.link.create(attrs));

    view.dispatch(tr);
    return true;
}

export function removeLink(view: EditorView) {
    const { state } = view;
    const { schema, selection } = state;

    if (!schema.marks.link || selection.empty) {
        return false;
    }

    const tr = state.tr.removeMark(selection.from, selection.to, schema.marks.link);

    view.dispatch(tr);
    return true;
}
