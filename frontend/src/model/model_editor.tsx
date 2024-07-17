import { DocHandle } from "@automerge/automerge-repo";
import { createSignal } from "solid-js";
import Resizable from "@corvu/resizable";

import { GraphvizSVG } from "../visualization";
import { TheoryId, TheoryMeta } from "../theory";
import { ModelNotebook } from "./types";
import { ModelNotebookEditor, ModelNotebookRef } from "./model_notebook_editor";
import { modelToGraphviz } from "./model_graph";


/** TODO
 */
export function ModelEditor(props: {
    handle: DocHandle<ModelNotebook>;
    init: ModelNotebook;
    theories: Map<TheoryId, TheoryMeta>;
}) {
    const [editorRef, setEditorRef] = createSignal<ModelNotebookRef>();

    const modelGraph = () => {
        const model = editorRef?.()?.model();
        return model && modelToGraphviz(model);
    };

    return <Resizable class="growable-container">
        <Resizable.Panel class="content-panel" collapsible
            initialSize={1} minSize={0.25}
        >
            <ModelNotebookEditor ref={setEditorRef}
                handle={props.handle} init={props.init}
                theories={props.theories} />
        </Resizable.Panel>
        <Resizable.Handle />
        <Resizable.Panel class="content-panel" collapsible
            initialSize={0} minSize={0.25}
        >
            <GraphvizSVG graph={modelGraph()} options={{
                engine: "neato",
            }}/>
        </Resizable.Panel>
    </Resizable>;
}
