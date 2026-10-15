import type { LLMInteraction } from "catcolab-document-types";
export const interactions = [
    {
        tag: "user-message",
        timestamp: "2026-09-14T09:00:00Z",
        id: "user-message",
        content: "Can you compute **two plus two**?",
        files: [
            {
                filename: "two-plus-two.txt",
                mediaType: "text/plain",
                content: Array.from("2 + 2".repeat(100), (char) => char.charCodeAt(0)),
            },
        ],
    },
    {
        tag: "llm-code-execution",
        timestamp: "2026-09-14T09:00:01Z",
        id: "code-execution",
        toolCallId: "tool-call",
        code: "return 2 + 2;",
        result: { tag: "Ok", value: "4" },
    },
    {
        tag: "llm-message",
        timestamp: "2026-09-14T09:00:02Z",
        id: "llm-message",
        content: "The result is $2 + 2 = 4$.",
    },
    {
        tag: "user-feedback-request",
        timestamp: "2026-09-14T09:00:03Z",
        id: "feedback-request",
        codeExecution: "code-execution",
        content: "Apply this result to the document?",
        resolution: "unresolved",
    },
] as LLMInteraction[];
