import { A } from "@solidjs/router";
import { makeDocumentProjection } from "solid-automerge";
import { createMemo } from "solid-js";

import type { LiveLLMConversationDoc } from "./live_doc_compatibility";

/** Attached document link shown in an LLM conversation document head. */
export function LLMConversationInfo(props: { liveConversation: LiveLLMConversationDoc }) {
    const attachedRefId = () => props.liveConversation.liveDoc.doc.llmConversationOf._id;
    // Memo keeps the view in sync if the bound document is replaced.
    const attachedDoc = createMemo(() =>
        makeDocumentProjection(props.liveConversation.attachment.handle.automergeHandle),
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
