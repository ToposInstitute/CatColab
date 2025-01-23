import type { Prop } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";

import { init } from "@automerge/prosemirror";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { Schema } from "prosemirror-model";
import { type Command, EditorState, Plugin, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import Popover from "@corvu/popover";
import Link from "lucide-solid/icons/link";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { useDocHandleReady } from "../api/document";
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
    addLink?: (url?: string) => void;
};

// Helper functions (keymap, placeholder, etc. remain the same as in original code)
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

/** Rich text editor combining Automerge and ProseMirror. */
export const RichTextEditor = (
    props: {
        handle: DocHandle<unknown>;
        path: Prop[];
    } & RichTextEditorOptions,
) => {
    let editorRoot!: HTMLDivElement;
    let editorView: EditorView;

    const isReady = useDocHandleReady(() => props.handle);
    const [url, setUrl] = createSignal("");
    const [isLinkPopoverOpen, setIsLinkPopoverOpen] = createSignal(false);

    createEffect(() => {
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

        editorView = new EditorView(editorRoot, {
            state: EditorState.create({ schema, plugins, doc: pmDoc }),
            dispatchTransaction: (tx: Transaction) => {
                if (!editorView.isDestroyed) {
                    editorView.updateState(editorView.state.apply(tx));
                }
            },
            handleDOMEvents: {
                focus: () => {
                    props.onFocus?.();
                    return false;
                },
            },
        });

        if (props.ref) {
            props.ref(editorView);
        }

        onCleanup(() => editorView.destroy());

        // Accessing the editor's selection
        const { state } = editorView;
        const { from, to } = state.selection;

        if (from === to) {
            alert("Please highlight the text you want to hyperlink.");
            return;
        }

        const url = prompt("Enter the URL:");
        if (url) {
            editorView.dispatch(state.tr.addMark(from, to, state.schema.mark({ href: url })));
        }
    });

    const handleAddLink = () => {
        if (!editorView) return;

        const { state, dispatch } = editorView;
        const { schema, selection } = state;

        if (schema.marks.link && !selection.empty) {
            const attrs = {
                href: url().startsWith("http") ? url() : `https://${url()}`,
                title: state.doc.textBetween(selection.from, selection.to),
            };

            const tr = state.tr.addMark(
                selection.from,
                selection.to,
                schema.marks.link.create(attrs),
            );

            dispatch(tr);
            setUrl("");
            setIsLinkPopoverOpen(false);
        }
    };

    return (
        <>
            <div class="rich-text-editor" ref={editorRoot} />
            {props.addLink && (
                <Popover open={isLinkPopoverOpen()} onOpenChange={setIsLinkPopoverOpen}>
                    <Popover.Anchor as="span">
                        <IconButton onClick={() => setIsLinkPopoverOpen(true)}>
                            <Link />
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
                                onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
                            />
                            <button onClick={handleAddLink}>Add Link</button>
                        </Popover.Content>
                    </Popover.Portal>
                </Popover>
            )}
        </>
    );
};
// Add hasContent function
const hasContent = (state: EditorState) => {
    const doc = state.doc;
    return doc.textContent || (doc.firstChild && doc.firstChild.content.size > 0);
};

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
