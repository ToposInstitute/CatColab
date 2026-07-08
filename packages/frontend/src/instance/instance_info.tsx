import { A } from "@solidjs/router";

import type { LiveInstanceDoc } from "./document";

/** Widget in the top right corner of a instance document pane.
 */
export function InstanceInfo(props: { liveInstance: LiveInstanceDoc }) {
    const liveModel = () => props.liveInstance.liveModel;
    const liveModelDoc = () => props.liveInstance.liveModel.liveDoc;
    const modelRefId = () => props.liveInstance.liveDoc.doc.instanceIn._id;

    return (
        <>
            <div class="name">{liveModel().theory()?.instanceOfName}</div>
            <div class="model">
                <A href={`/model/${modelRefId()}`}>{liveModelDoc().doc.name || "Untitled"}</A>
            </div>
        </>
    );
}
