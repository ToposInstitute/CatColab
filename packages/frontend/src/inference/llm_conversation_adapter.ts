import type { LLMConversationDocument } from "catcolab-document-methods";
import type { UserMessage } from "catcolab-document-types";
import { assertExhaustive } from "../util/assert_exhaustive.ts";
import type { OpenAITranscript } from "./chat.ts";

/** Files available to `contextExec`, indexed by their filenames. */
export type ConversationFiles = Readonly<Record<string, string | number[]>>;

/** The OpenAI request data derived from a persisted LLM conversation. */
export type LLMConversationInferenceContext = {
    transcript: OpenAITranscript;
    files: ConversationFiles;
};

/** Derive the OpenAI request data for a persisted LLM conversation. */
export function prepareLLMConversationInference(
    conversation: LLMConversationDocument,
): LLMConversationInferenceContext {
    const transcript: OpenAITranscript = [];
    const files: Record<string, string | number[]> = Object.create(null) as Record<
        string,
        string | number[]
    >;

    for (const interaction of conversation.interactions) {
        switch (interaction.tag) {
            case "user-message":
                transcript.push({ role: "user", content: userMessageToOpenAIContent(interaction) });
                for (const file of interaction.files) {
                    files[file.filename] = decodeFile(file.mediaType, file.content);
                }
                break;
            case "llm-message":
                transcript.push({ role: "assistant", content: interaction.content });
                break;
            case "llm-code-execution":
                transcript.push(
                    {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: interaction.toolCallId,
                                type: "function",
                                function: {
                                    name: "contextExec",
                                    arguments: JSON.stringify({ code: interaction.code }),
                                },
                            },
                        ],
                    },
                    {
                        role: "tool",
                        tool_call_id: interaction.toolCallId,
                        content: JSON.stringify(interaction.result),
                    },
                );
                break;
            case "user-feedback-request":
                switch (interaction.resolution) {
                    case "unresolved":
                        transcript.push({
                            role: "system",
                            content:
                                "The user has a follow up message and so your proposed changes were not applied.",
                        });
                        break;
                    case "approved":
                        transcript.push({
                            role: "system",
                            content: "The user accepted your proposed changes.",
                        });
                        break;
                    case "rejected":
                        transcript.push({
                            role: "system",
                            content: "The user rejected your proposed changes.",
                        });
                        break;
                    default:
                        assertExhaustive(interaction.resolution);
                }
                break;
            default:
                assertExhaustive(interaction);
        }
    }

    return { transcript, files: Object.freeze(files) };
}

/** Render a stored user message as the text sent to the LLM. */
function userMessageToOpenAIContent(message: UserMessage): string {
    if (message.files.length === 0) {
        return message.content;
    }

    const fileNames = [...new Set(message.files.map((file) => JSON.stringify(file.filename)))].join(
        ", ",
    );
    const availability = `The following files are now available in the \`files\` map: ${fileNames}.`;
    return message.content.length > 0 ? `${message.content}\n\n${availability}` : availability;
}

/** Special logic for doing "reasonable" decoding to files to insert into the
    execution environment. */
function decodeFile(_mediaType: string, content: number[]): string | number[] {
    // For now this is essentially a placeholder until we decide what we want to
    // do to different media types.
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(content));
    } catch {
        return content;
    }
}
