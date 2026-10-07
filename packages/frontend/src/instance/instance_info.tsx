import { A } from "@solidjs/router";
import { makeDocumentProjection } from "solid-automerge";
import { createMemo } from "solid-js";

import type { LiveInstanceDoc } from "./live_doc_compatibility";

/** Parent model link shown in an instance document head. */
export function InstanceInfo(props: { liveInstance: LiveInstanceDoc }) {
    // Memo keeps the view in sync if the bound document is replaced.
    const document = createMemo(() =>
        makeDocumentProjection(props.liveInstance.instance.handle.automergeHandle),
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
