import { A } from "@solidjs/router";

import { createDocumentSelector } from "../documents/reactivity";
import type { LiveLLMConversationDoc } from "./live_doc_compatibility";

/** Attached document link shown in an LLM conversation document head. */
export function LLMConversationInfo(props: { liveConversation: LiveLLMConversationDoc }) {
    const attachedRefId = () => props.liveConversation.liveDoc.doc.llmConversationOf._id;
    const attachedDoc = createDocumentSelector(
        () => props.liveConversation.attachment,
        () => props.liveConversation.attachment.document,
    );

    return (
        <>
            <div class="name">LLM conversation on</div>
            <div class="model">
                <A href={`/${attachedDoc().type}/${attachedRefId()}`}>
                    {attachedDoc().name || "Untitled"}
                </A>
            </div>
        </>
    );
}
