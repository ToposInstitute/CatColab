import { A } from "@solidjs/router";

import { createDocumentSelector } from "../documents/reactivity";
import type { LiveInstanceDoc } from "./live_doc_compatibility";

/** Parent model link shown in an instance document head. */
export function InstanceInfo(props: { liveInstance: LiveInstanceDoc }) {
    const modelRefId = createDocumentSelector(
        () => props.liveInstance.instance,
        () => props.liveInstance.instance.document.instanceOf._id,
    );

    return (
        <>
            <div class="name">Data instance of</div>
            <div class="model">
                <A href={`/model/${modelRefId()}`}>
                    {props.liveInstance.modelLiveDoc.doc.name || "Untitled"}
                </A>
            </div>
        </>
    );
}
