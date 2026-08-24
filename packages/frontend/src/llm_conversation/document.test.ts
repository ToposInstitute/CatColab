import { assert, beforeEach, describe, test, vi } from "vitest";

import type { Document, InlineFile } from "catcolab-document-types";
import {
    createBinder,
    defineMorphism,
    defineObject,
    defineShape,
    type Instance,
    type Notebook,
} from "catcolab-documents";
import { ThSchema } from "catlog-wasm";
import type {
    GeneratedOpenAIMessage,
    OpenAIChatTurnOptions,
    OpenAIChatTurnResult,
    OpenAITranscript,
} from "../inference/chat.ts";
import type { ContextExecScope } from "../inference/context_exec.ts";
import { runLLMConversationTurn } from "./document.ts";

const Entity = defineObject({ tag: "Basic", content: "Entity" });
const AttrType = defineObject({ tag: "Basic", content: "AttrType" });
const Mapping = defineMorphism({ tag: "Hom", content: Entity.obType });
const SimpleSchema = defineShape({
    theory: "simple-schema",
    getCoreTheory: async () => new ThSchema().theory(),
    objects: [Entity, AttrType],
    morphisms: [Mapping],
    supportsInstances: { tableObjects: [Entity] },
});

const inference = vi.hoisted(() => ({
    createInferenceClient: vi.fn<(apiKey: string) => unknown>(),
    runOpenAIChatTurn:
        vi.fn<
            (
                client: unknown,
                transcript: OpenAITranscript,
                scope: ContextExecScope,
                options?: OpenAIChatTurnOptions,
            ) => Promise<OpenAIChatTurnResult>
        >(),
}));

vi.mock("../inference/chat.ts", async (importOriginal) => ({
    ...(await importOriginal()),
    ...inference,
}));

const inputFile: InlineFile = {
    filename: "values.csv",
    mediaType: "text/csv",
    content: Array.from(new TextEncoder().encode("left,right\n0,1\n")),
};

const generatedMessageDelta: GeneratedOpenAIMessage[] = [
    {
        role: "assistant",
        content: null,
        tool_calls: [
            {
                id: "call_inspect",
                type: "function",
                function: {
                    name: "contextExec",
                    arguments: JSON.stringify({ code: "return files['values.csv'];" }),
                },
            },
        ],
    },
    {
        role: "tool",
        tool_call_id: "call_inspect",
        content: JSON.stringify({ tag: "Ok", value: "left,right\n0,1\n" }),
    },
    { role: "assistant", content: "The values are 0 and 1." },
];

type Fixture = Awaited<ReturnType<typeof makeFixture>>;

async function makeFixture(withInstance = false) {
    const binder = createBinder();
    const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
    let attachment: typeof schema | Instance<Document, typeof SimpleSchema> = schema;
    let instance: Instance<Document, typeof SimpleSchema> | undefined;

    if (withInstance) {
        const created = await binder.createInstance(schema, { title: "Company data" });
        assert.strictEqual(created.tag, "Ok");
        if (created.tag !== "Ok") {
            throw new Error("Failed to create test instance");
        }
        instance = created.content;
        attachment = instance;
    }

    const conversation = await binder.createLLMConversation(attachment, "test-model", {
        title: "Conversation",
    });
    return { binder, schema, instance, conversation };
}

function schemaBinding(scope: ContextExecScope): Notebook<typeof SimpleSchema> {
    const schema = scope.document_Company_schema;
    assert(schema);
    return schema as Notebook<typeof SimpleSchema>;
}

async function runTurn(fixture: Fixture) {
    return runLLMConversationTurn(
        fixture.conversation,
        fixture.binder.store,
        { tag: "Ready", key: "inference-key" },
        { content: "Inspect the document.", files: [inputFile] },
    );
}

describe("LLM conversation turns", () => {
    beforeEach(() => {
        inference.createInferenceClient.mockReset();
        inference.runOpenAIChatTurn.mockReset();
    });

    test("edits an isolated schema copy and commits it after validation", async () => {
        const fixture = await makeFixture();
        inference.createInferenceClient.mockReturnValue({});
        inference.runOpenAIChatTurn.mockImplementation(async (_client, _transcript, scope) => {
            schemaBinding(scope).update({ title: "Updated schema" });
            assert.strictEqual(fixture.schema.title, "Company schema");
            return {
                content: "The values are 0 and 1.",
                generatedMessageDelta,
            };
        });

        assert.deepStrictEqual(await runTurn(fixture), {
            tag: "Completed",
            content: "The values are 0 and 1.",
        });
        assert.strictEqual(fixture.schema.title, "Updated schema");

        const call = inference.runOpenAIChatTurn.mock.calls[0]!;
        assert.deepStrictEqual(call[2].files, { "values.csv": "left,right\n0,1\n" });
        assert.strictEqual(call[3]?.model, "test-model");
        assert.match(call[3]?.systemPromptSuffix ?? "", /Company schema/);
        assert.deepStrictEqual(
            fixture.conversation.interactions().map((interaction) => interaction.tag),
            ["user-message", "llm-code-execution", "llm-message"],
        );
    });

    test("puts an attached instance and its schema in scope", async () => {
        const fixture = await makeFixture(true);
        inference.createInferenceClient.mockReturnValue({});
        inference.runOpenAIChatTurn.mockImplementation(async (_client, _transcript, scope) => {
            const instance = scope.document_Company_data;
            assert(instance);
            (instance as Instance<unknown, typeof SimpleSchema>).update({
                title: "Updated data",
            });
            assert.strictEqual(fixture.instance?.title, "Company data");
            return {
                content: "Done.",
                generatedMessageDelta: [{ role: "assistant", content: "Done." }],
            };
        });

        assert.deepStrictEqual(await runTurn(fixture), { tag: "Completed", content: "Done." });
        assert.strictEqual(fixture.instance?.title, "Updated data");
        const suffix = inference.runOpenAIChatTurn.mock.calls[0]?.[3]?.systemPromptSuffix ?? "";
        assert.match(suffix, /Company data/);
        assert.match(suffix, /instance .* of/);
    });

    test("reprompts while the in-memory documents are invalid", async () => {
        const fixture = await makeFixture();
        inference.createInferenceClient.mockReturnValue({});
        let invalidCell: { delete(): void } | undefined;
        inference.runOpenAIChatTurn.mockImplementation(async (_client, transcript, scope) => {
            const schema = schemaBinding(scope);
            if (!invalidCell) {
                invalidCell = schema.add(Mapping, {
                    label: "invalid",
                    from: null,
                    to: null,
                });
                return {
                    content: "Done.",
                    generatedMessageDelta: [{ role: "assistant", content: "Done." }],
                };
            }
            assert.match(String(transcript.at(-1)?.content), /validation problems/);
            invalidCell.delete();
            schema.update({ title: "Repaired schema" });
            return {
                content: "Repaired.",
                generatedMessageDelta: [{ role: "assistant", content: "Repaired." }],
            };
        });

        assert.deepStrictEqual(await runTurn(fixture), {
            tag: "Completed",
            content: "Repaired.",
        });
        assert.strictEqual(inference.runOpenAIChatTurn.mock.calls.length, 2);
        assert.strictEqual(fixture.schema.title, "Repaired schema");
    });

    test("retains the user message when inference fails", async () => {
        const fixture = await makeFixture();
        inference.createInferenceClient.mockReturnValue({});
        inference.runOpenAIChatTurn.mockRejectedValue(new Error("network failed"));

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
