import { A } from "@solidjs/router";
import { createAutomergeDocumentView } from "catcolab-documents-solid-automerge/automerge";

import type { LiveLLMConversationDoc } from "./live_doc_compatibility";

/** Attached document link shown in an LLM conversation document head. */
export function LLMConversationInfo(props: { liveConversation: LiveLLMConversationDoc }) {
    const attachedRefId = () => props.liveConversation.liveDoc.doc.llmConversationOf._id;
    const attachedDoc = createAutomergeDocumentView(
        () => props.liveConversation.attachment.handle.automergeHandle,
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
