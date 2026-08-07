import { A } from "@solidjs/router";

import type { Instance } from "catcolab-documents";

/** Widget in the top right corner of an instance document pane.
 */
export function InstanceInfo(props: { instance: Instance }) {
    const modelRefId = () => props.instance.document.instanceOf._id;

    return (
        <>
            <div class="name">Data instance of</div>
            <div class="model">
                <A href={`/model/${modelRefId()}`}>
                    {props.instance.modelNotebook.title || "Untitled"}
                </A>
            </div>
        </>
    );
}
