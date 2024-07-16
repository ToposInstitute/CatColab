import { DocHandle } from "@automerge/automerge-repo";
import Resizable from "@corvu/resizable";

import { TheoryId, TheoryMeta } from "../theory";
import { ModelNotebook } from "./types";
import { ModelNotebookEditor } from "./model_notebook_editor";


/** TODO
 */
export function ModelEditor(props: {
    handle: DocHandle<ModelNotebook>;
    init: ModelNotebook;
    theories: Map<TheoryId, TheoryMeta>;
}) {

    return <Resizable class="growable-container">
        <Resizable.Panel class="content-panel" initialSize={1}>
            <ModelNotebookEditor handle={props.handle} init={props.init}
                theories={props.theories} />
        </Resizable.Panel>
        <Resizable.Handle />
        <Resizable.Panel class="content-panel" collapsible initialSize={0}
            minSize={0.25}
        >
            Model extras
        </Resizable.Panel>
    </Resizable>;
}
