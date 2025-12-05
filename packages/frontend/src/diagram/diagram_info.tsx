import { A } from "@solidjs/router";

import type { LiveDiagramDoc } from "./document";

/** Widget in the top right corner of a diagram document pane.
 */
export function DiagramInfo(props: { liveDiagram: LiveDiagramDoc }) {
    const liveModel = () => props.liveDiagram.liveModel;
    const liveModelDoc = () => props.liveDiagram.liveModel.liveDoc;
    const modelRefId = () => props.liveDiagram.liveDoc.doc.diagramIn._id;

    return (
        <>
            <div class="name">{liveModel().theory()?.instanceOfName}</div>
            <div class="model">
                <A href={`/model/${modelRefId()}`}>{liveModelDoc().doc.name || "Untitled"}</A>
            </div>
        </>
    );
}
