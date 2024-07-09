import { Prop } from "@automerge/automerge";
import { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo";
import { AutoMirror } from "@automerge/prosemirror";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
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
    handle: DocHandle<unknown>,
    path: Prop[];
}) => {
    let editorRef!: HTMLDivElement;

    const isReady = useDocHandleReady(() => props.handle);

    createEffect(() => {
        if (!isReady()) { return; }

        const autoMirror = new AutoMirror(props.path);

        let editorView: EditorView;
        editorView = new EditorView(editorRef, {
            state: EditorState.create({
                schema: autoMirror.schema,
                doc: autoMirror.initialize(props.handle),
            }),
            dispatchTransaction: (tx: Transaction) => {
                const newState = autoMirror.intercept(
                    props.handle, tx, editorView.state);
                editorView.updateState(newState);
            },
        });

        const onPatch = (payload: DocHandleChangePayload<unknown>) => {
            const newState = autoMirror.reconcilePatch(
                payload.patchInfo.before,
                payload.doc,
                payload.patches,
                editorView.state,
            );
            editorView.updateState(newState);
        };
        props.handle.on("change", onPatch);

        onCleanup(() => {
            props.handle.off("change", onPatch);
            editorView.destroy();
        });
    });

    return <div class="editable rich-text-editor" ref={editorRef}></div>;
}
