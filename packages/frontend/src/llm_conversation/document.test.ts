import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { assert, beforeEach, describe, test, vi } from "vitest";

import type { Document } from "catcolab-document-types";
import { createBinder, type Instance, type Notebook, type Result } from "catcolab-documents";
import type { ChatTurnResult } from "../inference/chat.ts";
import type { ContextExecScope } from "../inference/context_exec.ts";
import { runLLMConversationTurn } from "./document.ts";

type RunChatTurn = (typeof import("../inference/chat.ts"))["runChatTurn"];

const inference = vi.hoisted(() => ({
    createInferenceClient: vi.fn<(apiKey: string) => unknown>(),
    runChatTurn: vi.fn<RunChatTurn>(),
}));

vi.mock("../inference/chat.ts", async (importOriginal) => ({
    ...(await importOriginal()),
    ...inference,
}));

type Fixture = Awaited<ReturnType<typeof makeFixture>>;

async function makeFixture(withInstance = false) {
    const binder = createBinder();
    const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
    let attachment: typeof schema | Instance<Document, typeof SimpleSchema> = schema;
    let instance: Instance<Document, typeof SimpleSchema> | undefined;

    if (withInstance) {
        instance = expectOk(await binder.createInstance(schema, { title: "Company data" }));
        attachment = instance;
    }

    const conversation = await binder.createLLMConversation(attachment, "test-model", {
        title: "Conversation",
    });
    return { binder, schema, instance, conversation };
}

async function makeInvalidInstance(fixture: Fixture) {
    const instance = fixture.instance;
    assert(instance);
    fixture.schema.add(Entity, { label: "Person" });
    const table = expectOk(await instance.tables())[0];
    assert(table);
    const row = expectOk(await instance.addRow(table));
    fixture.binder.store.changeDocument(instance.handle, (document) => {
        assert.strictEqual(document.type, "instance");
        if (document.type !== "instance") {
            return;
        }
        const storedRow = document.tables[table.id]?.rows[row.id];
        assert(storedRow);
        storedRow.fields.unexpected = { String: "value" };
    });
    return { table, row };
}

function expectOk<T, E>(result: Result<T, E>): T {
    if (result.tag === "Err") {
        throw new Error(`Expected Ok, got ${JSON.stringify(result.content)}`);
    }
    return result.content;
}

function schemaBinding(scope: ContextExecScope): Notebook<typeof SimpleSchema> {
    const schema = scope.document_Company_schema;
    assert(schema);
    return schema as Notebook<typeof SimpleSchema>;
}

function response(content: string): ChatTurnResult {
    return {
        content,
        generatedMessageDelta: [{ role: "assistant", content }],
        termination: { tag: "FinalResponse" },
    };
}

async function runTurn(fixture: Fixture) {
    return runLLMConversationTurn(
        fixture.conversation,
        fixture.binder.store,
        { tag: "Ready", key: "inference-key" },
        { content: "Inspect the document.", files: [] },
    );
}

describe("LLM conversation turns", { timeout: 20_000 }, () => {
    beforeEach(() => {
        inference.createInferenceClient.mockReset();
        inference.runChatTurn.mockReset();
        inference.createInferenceClient.mockReturnValue({});
    });

    test("runs against an isolated document scope and commits valid changes", async () => {
        const fixture = await makeFixture();
        inference.runChatTurn.mockImplementation(async (_client, _transcript, scope) => {
            schemaBinding(scope).update({ title: "Updated schema" });
            assert.strictEqual(fixture.schema.title, "Company schema");
            return response("Done.");
        });

        assert.deepStrictEqual(await runTurn(fixture), { tag: "Completed", content: "Done." });
        assert.strictEqual(fixture.schema.title, "Updated schema");

        const call = inference.runChatTurn.mock.calls[0]!;
        assert.strictEqual(call[4], "test-model");
        assert.match(call[5] ?? "", /attached document "Company schema"/);
        assert.deepStrictEqual(
            fixture.conversation.interactions().map((interaction) => interaction.tag),
            ["user-message", "llm-message"],
        );
    });

    test("persists complete validation feedback from linked document tools", async () => {
        const fixture = await makeFixture(true);
        const { table, row } = await makeInvalidInstance(fixture);
        inference.runChatTurn.mockImplementation(
            async (
                _client,
                _transcript,
                scope,
                _onContent,
                _model,
                systemPromptSuffix,
                onSuccessHook,
            ) => {
                const attachedDocument = scope.document_Company_data as
                    | Instance<unknown, typeof SimpleSchema>
                    | undefined;
                assert(attachedDocument);
                assert(scope.document_Company_schema);
                assert.match(systemPromptSuffix ?? "", /Company data.*instanceOf.*Company schema/s);
                assert(onSuccessHook);

                let validationError: unknown;
                try {
                    await onSuccessHook();
                } catch (error) {
                    validationError = error;
                }
                assert(validationError instanceof Error);
                const feedback = validationError.message;
                assert.match(feedback, /"issueType":"MistypedLiteral"/);
                assert.ok(
                    feedback.includes(
                        JSON.stringify([table.id, "rows", row.id, "fields", "unexpected"]),
                    ),
                );

                attachedDocument.deleteRow(table.id, row.id);
                await onSuccessHook();
                return {
                    content: "Repaired.",
                    generatedMessageDelta: [
                        {
                            role: "assistant",
                            content: null,
                            tool_calls: [
                                {
                                    id: "call-inspect",
                                    type: "function",
                                    function: {
                                        name: "contextExec",
                                        arguments: JSON.stringify({ code: "return 'inspection';" }),
                                    },
                                },
                            ],
                        },
                        {
                            role: "tool",
                            tool_call_id: "call-inspect",
                            content: JSON.stringify({ tag: "Err", error: feedback }),
                        },
                        { role: "assistant", content: "Repaired." },
                    ],
                    termination: { tag: "FinalResponse" },
                };
            },
        );

        assert.deepStrictEqual(await runTurn(fixture), {
            tag: "Completed",
            content: "Repaired.",
        });
        assert.strictEqual(inference.runChatTurn.mock.calls.length, 1);
        const interactions = fixture.conversation.interactions();
        assert.deepStrictEqual(
            interactions.map((interaction) => interaction.tag),
            ["user-message", "llm-code-execution", "llm-message"],
        );
        const execution = interactions[1];
        assert(execution?.tag === "llm-code-execution");
        assert.strictEqual(execution.result.tag, "Err");
        if (execution.result.tag === "Err") {
            assert.match(execution.result.error, /"issueType":"MistypedLiteral"/);
        }
    });

    test("commits valid progress when the provider request limit is reached", async () => {
        const fixture = await makeFixture();
        inference.runChatTurn.mockImplementation(async (_client, _transcript, scope) => {
            schemaBinding(scope).update({ title: "Unfinished update" });
            return {
                content: "",
                generatedMessageDelta: [
                    {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "call-update",
                                type: "function",
                                function: {
                                    name: "contextExec",
                                    arguments: JSON.stringify({
                                        code: "document_Company_schema.update({ title: 'Unfinished update' });",
                                    }),
                                },
                            },
                        ],
                    },
                    {
                        role: "tool",
                        tool_call_id: "call-update",
                        content: JSON.stringify({ tag: "Ok", value: "undefined" }),
                    },
                ],
                termination: { tag: "ProviderRequestLimit" },
            };
        });

        assert.deepStrictEqual(await runTurn(fixture), {
            tag: "Retryable",
            error: "The model exhausted the provider request budget before producing a final response.",
        });
        assert.strictEqual(fixture.schema.title, "Unfinished update");
        assert.deepStrictEqual(
            fixture.conversation.interactions().map((interaction) => interaction.tag),
            ["user-message", "llm-code-execution"],
        );
    });

    test("retains the user message when inference fails", async () => {
        const fixture = await makeFixture();
        inference.runChatTurn.mockRejectedValue(new Error("network failed"));

        assert.deepStrictEqual(await runTurn(fixture), {
            tag: "Retryable",
            error: "network failed",
        });
        assert.deepStrictEqual(
            fixture.conversation.interactions().map((interaction) => interaction.tag),
            ["user-message"],
        );
    });
});
