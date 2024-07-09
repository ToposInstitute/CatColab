import { Prop } from "@automerge/automerge";
import { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo";
import { createEffect, onCleanup } from "solid-js";
import { Command, EditorState, Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { AutoMirror } from "@automerge/prosemirror";

import { useDocHandleReady } from "../util/automerge_solid";

import "prosemirror-view/style/prosemirror.css";
import "./editable.css";
import "./rich_text_editor.css";


/** Optional props for `RichTextEditor` component.
 */
export type RichTextEditorOptions = {
    ref?: (ref: EditorView) => void;
    placeholder?: string;

    deleteBackward?: () => void;
    deleteForward?: () => void;
};

/** Rich text editor combining Automerge and ProseMirror.

Adapted from:

- https://github.com/automerge/prosemirror-quickstart/
- https://github.com/automerge/automerge-prosemirror/tree/main/playground/
 */
export const RichTextEditor = (props: {
    handle: DocHandle<unknown>;
    path: Prop[];
} & RichTextEditorOptions) => {
    let editorRoot!: HTMLDivElement;

    const isReady = useDocHandleReady(() => props.handle);

    createEffect(() => {
        if (!isReady()) { return; }

        const autoMirror = new AutoMirror(props.path);
        const schema = autoMirror.schema;

        const bindings: {[key: string]: Command} = {
            "Mod-b": toggleMark(schema.marks.strong),
            "Mod-i": toggleMark(schema.marks.em),
        }
        if (props.deleteBackward) {
            bindings["Backspace"] = doIfEmpty(props.deleteBackward);
        }
        if (props.deleteForward) {
            bindings["Delete"] = doIfEmpty(props.deleteForward);
        }

        const plugins: Plugin[] = [
            keymap(bindings),
            keymap(baseKeymap),
        ];
        if (props.placeholder) {
            plugins.push(placeholder(props.placeholder));
        }

        let view: EditorView;
        view = new EditorView(editorRoot, {
            state: EditorState.create({
                schema,
                plugins,
                doc: autoMirror.initialize(props.handle),
            }),
            dispatchTransaction: (tx: Transaction) => {
                const newState = autoMirror.intercept(
                    props.handle, tx, view.state);
                view.updateState(newState);
            },
        });
        if (props.ref) {
            props.ref(view);
        }

        const onPatch = (payload: DocHandleChangePayload<unknown>) => {
            // XXX: Quit if a higher-level node is being deleted. Otherwise,
            // `reconcilePatch` can error, a bug in `automerge-prosemirror`.
            for (const patch of payload.patches) {
                if (patch.action === "del" &&
                    patch.path.length < props.path.length) {
                    return;
                }
            }

            const newState = autoMirror.reconcilePatch(
                payload.patchInfo.before,
                payload.doc,
                payload.patches,
                view.state,
            );
            view.updateState(newState);
        };
        props.handle.on("change", onPatch);

        onCleanup(() => {
            props.handle.off("change", onPatch);
            view.destroy();
        });
    });

    return <div class="editable rich-text-editor" ref={editorRoot}></div>;
}


/** ProseMirror command that calls a function if the document is empty.
 */
function doIfEmpty(callback: (dispatch: (tr: Transaction) => void) => void): Command {
    return (state, dispatch?) => {
        if (hasContent(state)) {
            return false;
        }
        if (dispatch) {
            callback(dispatch);
        }
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
      view.dom.removeAttribute('data-placeholder');
    } else {
      view.dom.setAttribute('data-placeholder', text);
    }
  };

  return new Plugin({
    view(view) {
      update(view);

      return { update };
    }
  });
}

const hasContent = (state: EditorState) => {
    const doc = state.doc;
    return (doc.textContent ||
            (doc.firstChild && doc.firstChild.content.size > 0));
}
