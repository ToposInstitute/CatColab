import { type FirebaseOptions, initializeApp } from "firebase/app";
import { deleteUser, getAuth } from "firebase/auth";
import invariant from "tiny-invariant";
import { afterAll, assert, beforeAll, describe, test } from "vitest";

import { createFetchWithAuth, createRpcClient } from "../api/rpc.ts";
import { initTestUserAuth } from "../util/test_util.ts";
import { createInferenceClient, runOpenAIChatTurn, type OpenAITranscript } from "./chat.ts";

// When inference is configured, these tests exercise a live `runOpenAIChatTurn`
// against OpenRouter, using a free model. A backend without
// `OPENROUTER_PROVISIONING_KEY` is expected to report inference as unavailable,
// in which case the OpenRouter assertions have nothing to exercise.

const serverUrl = import.meta.env.VITE_SERVER_URL;
const firebaseOptions = JSON.parse(import.meta.env.VITE_FIREBASE_OPTIONS) as FirebaseOptions;

const firebaseApp = initializeApp(firebaseOptions);
const rpc = createRpcClient(serverUrl, createFetchWithAuth(firebaseApp));

const testModel = "openai/gpt-oss-20b:free";

describe("chat turn over OpenRouter", () => {
    const auth = getAuth(firebaseApp);
    let client: ReturnType<typeof createInferenceClient> | undefined;

    beforeAll(async () => {
        await initTestUserAuth(auth, "test-inference-chat@catcolab.org", "foobar");
        invariant(auth.currentUser);

        await rpc.sign_up_or_sign_in.mutate();
        const keyResult = await rpc.get_inference_key.query();
        if (keyResult.tag === "Err") {
            assert.strictEqual(
                keyResult.code,
                503,
                "only expected authenticated error is inference unavailable (503)",
            );
            return;
        }
        client = createInferenceClient(keyResult.content);
    });

    afterAll(async () => {
        if (auth.currentUser) {
            await deleteUser(auth.currentUser);
        }
    });

    test(
        "streams a final assistant string for a trivial prompt",
        { timeout: 120000 },
        async ({ skip }) => {
            if (!client) {
                skip("inference is unavailable (503)");
                return;
            }

            const transcript: OpenAITranscript = [
                { role: "user", content: "Reply with exactly the word: pong" },
            ];
            const result = await runOpenAIChatTurn(client, transcript, {}, undefined, testModel);

            assert.ok(result.content.length > 0, "final content should be a non-empty string");
            assert.strictEqual(transcript[0]?.role, "user");
            assert.strictEqual(result.generatedMessageDelta.at(-1)?.role, "assistant");
        },
    );

    test(
        "records the contextExec call and result as OpenAI messages",
        { timeout: 120000 },
        async ({ skip }) => {
            if (!client) {
                skip("inference is unavailable (503)");
                return;
            }

            const transcript: OpenAITranscript = [
                {
                    role: "user",
                    content: "Use contextExec to evaluate 6 * 7, then tell me the result.",
                },
            ];
            const result = await runOpenAIChatTurn(client, transcript, {}, undefined, testModel);

            const assistant = result.generatedMessageDelta.find(
                (message) =>
                    message.role === "assistant" &&
                    message.tool_calls?.some(
                        (call) => call.type === "function" && call.function.name === "contextExec",
                    ),
            );
            invariant(assistant?.role === "assistant");

            const toolCall = assistant.tool_calls?.find(
                (call) => call.type === "function" && call.function.name === "contextExec",
            );
            invariant(toolCall);

            const toolResult = result.generatedMessageDelta.find(
                (message) => message.role === "tool" && message.tool_call_id === toolCall.id,
            );
            invariant(toolResult?.role === "tool");
            invariant(typeof toolResult.content === "string");
            assert.deepStrictEqual(JSON.parse(toolResult.content), { tag: "Ok", value: "42" });
        },
    );
});
