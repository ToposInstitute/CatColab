import type { Prop } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";

import { type MappedSchemaSpec, SchemaAdapter, init } from "@automerge/prosemirror";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { NodeType, Schema } from "prosemirror-model";
import {
    type Command,
    EditorState,
    NodeSelection,
    Plugin,
    TextSelection,
    type Transaction,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { createEffect, onCleanup } from "solid-js";
import { useDocHandleReady } from "../../api/document";

import "katex/dist/katex.min.css";
import "@benrbray/prosemirror-math/dist/prosemirror-math.css";
import "prosemirror-view/style/prosemirror.css";
import "./rich_text_editor.css";
import { useApi } from "../../api";
import { basicSchema } from "./basic_schema";
import { catcolabSchema } from "./catcolab_schema";
import { katexSchema } from "./katex_schema";
import { RefIdView } from "./ref_id_view";

import { mathPlugin, mathSerializer } from "@benrbray/prosemirror-math";

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

        const customSchema: MappedSchemaSpec = {
            nodes: {
                ...basicSchema.nodes,
                ...catcolabSchema.nodes,
                ...katexSchema.nodes,
            },
            marks: {
                ...basicSchema.marks,
                ...catcolabSchema.marks,
            },
        };

        const { schema, pmDoc, plugin } = init(props.handle, props.path, {
            schemaAdapter: new SchemaAdapter(customSchema),
        });

        const plugins: Plugin[] = [
            keymap(richTextEditorKeymap(schema, props)),
            keymap(baseKeymap),
            ...(props.placeholder ? [placeholder(props.placeholder)] : []),
            plugin,
            mathPlugin,
        ];

        const state = EditorState.create({ schema, plugins, doc: pmDoc });
        const view = new EditorView(editorRoot, {
            state,
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
            nodeViews: {
                catcolabref(node, view, getPos) {
                    return new RefIdView(node, view, getPos, api);
                },
            },
            clipboardTextSerializer: (slice) => {
                return mathSerializer.serializeSlice(slice);
            },
        });
        if (props.ref) {
            props.ref(view);
        }

        onCleanup(() => view.destroy());
    });

    return <div class="rich-text-editor" ref={editorRoot} />;
};

// copied from "@benrbray/prosemirror-math" to hack on
export function insertMathCmd(mathNodeType: NodeType, initialText = ""): Command {
    return (state: EditorState, dispatch: ((tr: Transaction) => void) | undefined) => {
        const { $from, $to } = state.selection;

        // The idiomatic thing is to do a check with canReplaceWith
        // if (!$from.parent.canReplaceWith(index, index, mathNodeType)) {
        // 	return false;
        // }
        if (dispatch) {
            let selectedText = state.doc.textBetween($from.pos, $to.pos, " ");
            let initialTextContent = initialText || selectedText;
            let initialContent = initialTextContent ? state.schema.text(initialTextContent) : null;

            const mathNode = mathNodeType.create(
                {},
                initialContent
            );

            let tr = state.tr;
            if ($from.pos !== $to.pos) {
                tr = tr.delete($from.pos, $to.pos);
            }

            // If we 
            if ($from.parent.type.name === "paragraph" && $from.parent.content.size !== 0) {
                tr = tr.split($from.pos);
            }

            tr = tr.insert($from.pos, mathNode);
            tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos +1));

            dispatch(tr);
        }
        return true;
    };
}


export function insertMathCmd2(mathNodeType: NodeType, initialText=""): Command {
	return function(state:EditorState, dispatch:((tr:Transaction)=>void)|undefined){
		let { $from } = state.selection, index = $from.index();
		if (!$from.parent.canReplaceWith(index, index, mathNodeType)) {
			return false;
		}
		if (dispatch){
			let mathNode = mathNodeType.create({}, initialText ? state.schema.text(initialText) : null);
			let tr = state.tr.replaceSelectionWith(mathNode);
			tr = tr.setSelection(NodeSelection.create(tr.doc, $from.pos));
			dispatch(tr);
		}
		return true;
	}
}
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

    function insertCatcolabRef(node: NodeType): Command {
        return (state, dispatch) => {
            const { $from } = state.selection;
            const index = $from.index();
            if (!$from.parent.canReplaceWith(index, index, node)) {
                return false;
            }
            if (dispatch) {
                dispatch(state.tr.replaceSelectionWith(node.create()));
            }
            return true;
        };
    }

    if (schema.nodes.catcolabref) {
        bindings["Alt-x"] = insertCatcolabRef(schema.nodes.catcolabref);
        bindings["Mod-x"] = insertCatcolabRef(schema.nodes.catcolabref);
    }

    if (schema.nodes.math_display) {
        bindings["Mod-m"] = insertMathCmd(schema.nodes.math_display);
    }

    if (schema.nodes.math_inline) {
        bindings["Mod-i"] = insertMathCmd2(schema.nodes.math_inline);
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
