import { A } from "@solidjs/router";

import { createAutomergeDocumentView } from "../documents/reactivity";
import type { LiveInstanceDoc } from "./live_doc_compatibility";

/** Parent model link shown in an instance document head. */
export function InstanceInfo(props: { liveInstance: LiveInstanceDoc }) {
    const document = createAutomergeDocumentView(
        () => props.liveInstance.instance.handle.automergeHandle,
    );
    const modelRefId = () => {
        const current = document();
        return current.type === "instance" ? current.instanceOf._id : undefined;
    };

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
