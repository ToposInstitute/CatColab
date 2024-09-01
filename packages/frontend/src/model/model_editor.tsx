import type { DocHandle } from "@automerge/automerge-repo";
import Resizable from "@corvu/resizable";
import { Show, createSignal } from "solid-js";

import type { RPCClient } from "../api";
import type { TheoryLibrary } from "../stdlib";
import { ModelAnalyzer } from "./model_analyzer";
import { ModelNotebookEditor, type ModelNotebookRef } from "./model_notebook_editor";
import type { ModelNotebook } from "./types";

/** Editor for a model of a double theory.

The editor includes a notebook for the model itself plus another pane for
performing analysis of the model.
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
                        <ModelAnalyzer
                            handle={props.handle}
                            path={["analysis"]}
                            modelNotebookRef={ref()}
                        />
                    )}
                </Show>
            </Resizable.Panel>
        </Resizable>
    );
}
