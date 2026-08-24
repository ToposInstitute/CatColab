import { A } from "@solidjs/router";

import type { LiveLLMConversationDoc } from "./live_doc_compatibility";

/** Parent model link shown in an LLM conversation document head. */
export function LLMConversationInfo(props: { liveConversation: LiveLLMConversationDoc }) {
    const modelRefId = () => props.liveConversation.liveDoc.doc.llmConversationOf._id;

    return (
        <>
            <div class="name">LLM Conversation of</div>
            <div class="model">
                <A href={`/model/${modelRefId()}`}>
                    {props.liveConversation.modelLiveDoc.doc.name || "Untitled"}
                </A>
            </div>
        </>
    );
}
