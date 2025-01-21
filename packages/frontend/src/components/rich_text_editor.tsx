import type { Prop } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";

import { init } from "@automerge/prosemirror";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { Schema } from "prosemirror-model";
import { type Command, EditorState, Plugin, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { createEffect, createSignal, onCleanup } from "solid-js";
import { useDocHandleReady } from "../api/document";
import Popover from '@corvu/popover';
import Link from "lucide-solid/icons/link"
import { IconButton } from "./icon_button";

import "./rich_text_editor.css";

/** Optional props for `RichTextEditor` component. */
export type RichTextEditorOptions = {
    id?: unknown;
    ref?: (ref: EditorView) => void;
    placeholder?: string;

    deleteBackward?: () => void;
    deleteForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;

    onFocus?: () => void;
};

/** Rich text editor combining Automerge and ProseMirror. */
export const RichTextEditor = (
    props: {
        handle: DocHandle<unknown>;
        path: Prop[];
    } & RichTextEditorOptions,
) => {
    let editorRoot!: HTMLDivElement;

    const isReady = useDocHandleReady(() => props.handle);

    // Signal for managing the popover visibility
    const [isPopoverOpen, setPopoverOpen] = createSignal(false);
    const [url, setUrl] = createSignal("");

    createEffect(() => {
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

        const handleAddLink = () => {
            if ( !view ||!url()) return;
            const success = addLink(view, url());
            if (!success) {
                alert("Please select text to apply the link.");
            }
            setPopoverOpen(false); // Close the popover after applying the link
        };
                <Popover>
                    <Popover.Anchor as="span">
                        <IconButton>  <Link />
                        </IconButton>
                    </Popover.Anchor>
                    <Popover.Portal>
                        <Popover.Overlay />
                        <Popover.Content>
                            <Popover.Arrow />
                            <Popover.Label>Insert Link</Popover.Label>
                            <Popover.Description>
                                Add a URL to the selected text.
                            </Popover.Description>
                            <input
                                type="url"
                                placeholder="Enter URL"
                                value={url()}
                                onInput={(e) => setUrl(e.target.value)} // Update the URL state as the user types
                            />
                            <button
                                onClick={handleAddLink} 
                            >
                                Add Link
                            </button>
                        </Popover.Content>
                    </Popover.Portal>
                </Popover>
    })


    



// Keymap for rich text editor
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

// ProseMirror command invoked if the document is empty
function doIfEmpty(callback: (dispatch: (tr: Transaction) => void) => void): Command {
    return (state, dispatch?) => {
        if (hasContent(state)) {
            return false;
        }
        dispatch && callback(dispatch);
        return true;
    };
}

// ProseMirror command invoked if the cursor is at the top of the document
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

// ProseMirror command invoked if the cursor is at the bottom of the document
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

// Placeholder text plugin for ProseMirror
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

// Check if the document has content
const hasContent = (state: EditorState) => {
    const doc = state.doc;
    return doc.textContent || (doc.firstChild && doc.firstChild.content.size > 0);
};

// Add a link to the selected text
function addLink(view: EditorView, url: string) {
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
}