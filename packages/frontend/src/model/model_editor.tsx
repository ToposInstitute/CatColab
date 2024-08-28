import type { DocHandle } from "@automerge/automerge-repo";
import Resizable from "@corvu/resizable";
import { Show, createSignal } from "solid-js";

import type { RPCClient } from "../api";
import type { TheoryLibrary } from "../stdlib";
import { ModelNotebookEditor, type ModelNotebookRef } from "./model_notebook_editor";
import { ModelViewEditor } from "./model_view_editor";
import type { ModelNotebook } from "./types";

/** Editor for a model of a double theory.

TODO:
 */
export function ModelEditor(props: {
    handle: DocHandle<ModelNotebook>;
    init: ModelNotebook;
    client: RPCClient;
    refId: string;
    theories: TheoryLibrary;
}) {
    const [editorRef, setEditorRef] = createSignal<ModelNotebookRef>();

    return (
        <Resizable class="growable-container">
            <Resizable.Panel class="content-panel" collapsible initialSize={1} minSize={0.25}>
                <button
                    onClick={() => props.client.saveRef.mutate({ refId: props.refId, note: "" })}
                >
                    Save
                </button>
                <ModelNotebookEditor
                    ref={setEditorRef}
                    handle={props.handle}
                    init={props.init}
                    theories={props.theories}
                />
            </Resizable.Panel>
            <Resizable.Handle />
            <Resizable.Panel class="content-panel" collapsible initialSize={0} minSize={0.25}>
                <Show when={editorRef()}>
                    {(ref) => (
                        <ModelViewEditor
                            handle={props.handle}
                            path={["views"]}
                            modelNotebookRef={ref()}
                        />
                    )}
                </Show>
            </Resizable.Panel>
        </Resizable>
    );
}
