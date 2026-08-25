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
/** Default LLM used for newly created CatColab conversations. */
export const DEFAULT_LLM_MODEL = "z-ai/glm-5.2";

/** Maximum model completions, including tool-use continuations, in one user turn. */
export const MAX_CHAT_COMPLETIONS_PER_TURN = 10;

const EMPTY_FILES = Object.freeze(Object.create(null)) as Readonly<Record<string, string>>;

const SYSTEM_PROMPT =
    "You are an assistant embedded in CatColab. Use `contextExec` when you need to inspect, compute with, or act on the current CatColab context. It executes JavaScript with the available context values as local bindings. The read-only `files` binding maps available filenames to their UTF-8 content; use `Object.keys(files)` to inspect its keys. Use `return` when you need to observe a value; `await` can be used directly. Only use bindings and APIs explicitly described as available. Answer the user's request clearly and concisely, using tool results when relevant.";

/** Message in the OpenAI-compatible transcript sent for an inference request. */
export type OpenAITranscriptMessage =
    | ChatCompletionSystemMessageParam
    | ChatCompletionUserMessageParam
    | ChatCompletionAssistantMessageParam
    | ChatCompletionToolMessageParam;

/** Ephemeral OpenAI-compatible transcript sent for an inference request. */
export type OpenAITranscript = OpenAITranscriptMessage[];

/** Assistant or tool message newly generated during one OpenAI inference request. */
export type GeneratedOpenAIMessage =
    | ChatCompletionAssistantMessageParam
    | ChatCompletionToolMessageParam;

/** Completed OpenAI inference output, not including the request transcript. */
export type OpenAIChatTurnResult = {
    content: string;
    generatedMessageDelta: GeneratedOpenAIMessage[];
};

export type ChatTurnOptions = {
    onContent?: (delta: string, snapshot: string) => void;
    model?: string;
    systemPromptSuffix?: string;
    onSuccessHook?: () => Promise<void>;
    maxChatCompletions?: number;
};

/** Create an OpenAI client configured for OpenRouter. */
export function createInferenceClient(apiKey: string): OpenAI {
    return new OpenAI({
        baseURL: OPENROUTER_BASE_URL,
        apiKey,
        dangerouslyAllowBrowser: true,
    });
}

/** Run one OpenAI inference turn against a complete, ephemeral request transcript. */
export async function runOpenAIChatTurn(
    client: OpenAI,
    openAITranscript: readonly OpenAITranscriptMessage[],
    scope: ContextExecScope,
    options: ChatTurnOptions = {},
): Promise<OpenAIChatTurnResult> {
    const contextScope: ContextExecScope = { files: EMPTY_FILES, ...scope };
    const systemPrompt = options.systemPromptSuffix
        ? `${SYSTEM_PROMPT}\n\n${options.systemPromptSuffix}`
        : SYSTEM_PROMPT;

    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...openAITranscript,
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
    const generatedMessageDelta: GeneratedOpenAIMessage[] = [];
    for (const message of runner.messages.slice(messages.length)) {
        if (message.role !== "assistant" && message.role !== "tool") {
            throw new Error(`Unexpected generated message role: ${message.role}`);
        }
        generatedMessageDelta.push(message);
    }

    return { content, generatedMessageDelta };
}

/** Parse the arguments of an OpenAI `contextExec` function call. */
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
