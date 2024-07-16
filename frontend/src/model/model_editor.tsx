import { DocHandle } from "@automerge/automerge-repo";
import { createSignal } from "solid-js";
import Resizable from "@corvu/resizable";

import type * as Viz from "@viz-js/viz";
import { GraphvizSVG } from "../visualization";

import { TheoryId, TheoryMeta } from "../theory";
import { isoObjectId, isoMorphismId, ModelNotebook } from "./types";
import { ModelNotebookEditor, ModelNotebookRef } from "./model_notebook_editor";


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
        return model && modelToGraph(model);
    };

    return <Resizable class="growable-container">
        <Resizable.Panel class="content-panel" initialSize={1}>
            <ModelNotebookEditor ref={setEditorRef}
                handle={props.handle} init={props.init}
                theories={props.theories} />
        </Resizable.Panel>
        <Resizable.Handle />
        <Resizable.Panel class="content-panel" collapsible initialSize={0}
            minSize={0.25}
        >
            <GraphvizSVG graph={modelGraph()} />
        </Resizable.Panel>
    </Resizable>;
}


function modelToGraph(model: ModelNotebook): Viz.Graph {
    const nodes = [];
    const edges = [];
    for (const cell of model.notebook.cells) {
        if (cell.tag !== "formal") {
            continue;
        }
        const judgment = cell.content;
        if (judgment.tag === "object") {
            const { id, name } = judgment;
            nodes.push({
                name: isoObjectId.unwrap(id),
                attributes: {
                    id: isoObjectId.unwrap(id),
                    label: name,
                },
            });
        } else if (judgment.tag === "morphism") {
            const { id, name, dom, cod } = judgment;
            if (!dom || !cod) {
                continue;
            }
            edges.push({
                head: isoObjectId.unwrap(dom),
                tail: isoObjectId.unwrap(cod),
                attributes: {
                    id: isoMorphismId.unwrap(id),
                    xlabel: name,
                }
            });
        }
    }
    return {
        directed: true,
        nodes,
        edges,
    };
}
