import { Prop } from "@automerge/automerge";
import { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo";
import { AutoMirror } from "@automerge/prosemirror";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { createEffect, onCleanup } from "solid-js";

import { useDocHandleReady } from "../util/automerge_solid";

import "prosemirror-view/style/prosemirror.css";
import "./editable.css";
import "./rich_text_editor.css";


/** Rich text editor combining Automerge and ProseMirror.

Adapted from:

- https://github.com/automerge/prosemirror-quickstart/
- https://github.com/automerge/automerge-prosemirror/tree/main/playground/
 */
export const AutomergeRichTextEditor = (props: {
    handle: DocHandle<unknown>;
    path: Prop[];
    placeholder?: string;
}) => {
    let editorRef!: HTMLDivElement;

    const isReady = useDocHandleReady(() => props.handle);

    createEffect(() => {
        if (!isReady()) { return; }

        const autoMirror = new AutoMirror(props.path);
        const schema = autoMirror.schema;

        const plugins: Plugin[] = [
            keymap({
                "Mod-b": toggleMark(schema.marks.strong),
                "Mod-i": toggleMark(schema.marks.em),
            }),
            keymap(baseKeymap),
        ];
        if (props.placeholder) {
            plugins.push(placeholder(props.placeholder));
        }

        let view: EditorView;
        view = new EditorView(editorRef, {
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

        const onPatch = (payload: DocHandleChangePayload<unknown>) => {
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

    return <div class="editable rich-text-editor" ref={editorRef}></div>;
}


/** Placeholder text plugin for ProseMirror.

Source:

- https://discuss.prosemirror.net/t/how-to-input-like-placeholder-behavior/705
- https://gist.github.com/amk221/1f9657e92e003a3725aaa4cf86a07cc0
 */
function placeholder(text: string) {
  const update = (view: EditorView) => {
    if (view.state.doc.textContent) {
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
