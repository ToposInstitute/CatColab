import OpenAI from "openai";
import type {
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionToolMessageParam,
    ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions";

import { type ContextExecScope, type EvalResult, contextExec } from "./context_exec";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type InferenceClient = OpenAI;
/** Default LLM used for newly created CatColab conversations. */
export const DEFAULT_LLM_MODEL = "z-ai/glm-5.2";

/** Maximum model completions, including tool-use continuations, in one user turn. */
export const MAX_CHAT_COMPLETIONS_PER_TURN = 10;

const EMPTY_FILES = Object.freeze(Object.create(null)) as Readonly<Record<string, string>>;

const SYSTEM_PROMPT =
    "You are an assistant embedded in CatColab. Use `contextExec` when you need to inspect, compute with, or act on the current CatColab context. It executes JavaScript with the available context values as local bindings. The read-only `files` binding maps available filenames to their UTF-8 content; use `Object.keys(files)` to inspect its keys. Use `return` when you need to observe a value; `await` can be used directly. Only use bindings and APIs explicitly described as available. Answer the user's request clearly and concisely, using tool results when relevant.";

/** Message in the transcript sent for an inference request. */
export type ChatTranscriptMessage =
    | ChatCompletionSystemMessageParam
    | ChatCompletionUserMessageParam
    | ChatCompletionAssistantMessageParam
    | ChatCompletionToolMessageParam;

/** Ephemeral transcript sent for an inference request. */
export type ChatTranscript = ChatTranscriptMessage[];

/** Assistant or tool message newly generated during one inference request. */
export type GeneratedChatMessage =
    | ChatCompletionAssistantMessageParam
    | ChatCompletionToolMessageParam;

/** Completed inference output, not including the request transcript. */
export type ChatTurnResult = {
    content: string;
    generatedMessageDelta: GeneratedChatMessage[];
};

export type ChatTurnOptions = {
    onContent?: (delta: string, snapshot: string) => void;
    model?: string;
    systemPromptSuffix?: string;
    onSuccessHook?: () => Promise<void>;
    maxChatCompletions?: number;
};

/** Create an inference client configured for OpenRouter. */
export function createInferenceClient(apiKey: string): InferenceClient {
    return new OpenAI({
        baseURL: OPENROUTER_BASE_URL,
        apiKey,
        dangerouslyAllowBrowser: true,
    });
}

/** Run one inference turn against a complete, ephemeral request transcript. */
export async function runChatTurn(
    client: InferenceClient,
    transcript: readonly ChatTranscriptMessage[],
    scope: ContextExecScope,
    options: ChatTurnOptions = {},
): Promise<ChatTurnResult> {
    const contextScope: ContextExecScope = { files: EMPTY_FILES, ...scope };
    const systemPrompt = options.systemPromptSuffix
        ? `${SYSTEM_PROMPT}\n\n${options.systemPromptSuffix}`
        : SYSTEM_PROMPT;

    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...transcript,
    ];

    const runner = client.chat.completions.runTools(
        {
            model: options.model ?? DEFAULT_LLM_MODEL,
            messages,
            stream: true,
            parallel_tool_calls: false,
            tools: [
                {
                    type: "function",
                    function: {
                        name: "contextExec",
                        description:
                            "Execute JavaScript with the available CatColab context values as local bindings.",
                        parameters: {
                            type: "object",
                            properties: {
                                code: {
                                    type: "string",
                                    description:
                                        "JavaScript to execute. Use return to provide a result; await can be used directly.",
                                },
                            },
                            required: ["code"],
                            additionalProperties: false,
                        },
                        function: async (rawArgs: string): Promise<EvalResult> => {
                            const args = parseContextExecArguments(rawArgs);
                            if (!args) {
                                return { tag: "Err", error: "Invalid contextExec arguments" };
                            }
                            return await contextExec(
                                args.code,
                                contextScope,
                                options.onSuccessHook,
                            );
                        },
                    },
                },
            ],
        },
        {
            maxChatCompletions: options.maxChatCompletions ?? MAX_CHAT_COMPLETIONS_PER_TURN,
        },
    );

    if (options.onContent) {
        runner.on("content", options.onContent);
    }

    const content = (await runner.finalContent()) ?? "";
    const generatedMessageDelta: GeneratedChatMessage[] = [];
    for (const message of runner.messages.slice(messages.length)) {
        if (message.role !== "assistant" && message.role !== "tool") {
            throw new Error(`Unexpected generated message role: ${message.role}`);
        }
        generatedMessageDelta.push(message);
    }

    return { content, generatedMessageDelta };
}

/** Parse the arguments of a `contextExec` function call. */
export function parseContextExecArguments(rawArgs: string): { code: string } | undefined {
    try {
        const value = JSON.parse(rawArgs) as { code?: unknown } | null;
        return typeof value?.code === "string" ? { code: value.code } : undefined;
    } catch {
        return undefined;
    }
}

/** Parse the SDK-generated result of a `contextExec` tool call. */
export function parseContextExecResult(content: string): EvalResult {
    return JSON.parse(content) as EvalResult;
}
