import { describe, expect, test } from "vitest";

import {
    createBinder,
    defineObject,
    defineShape,
    PathEquation,
    RichText,
} from "catcolab-documents";
import { createLLMConversationExecutionScope } from "./execution_scope";

describe("LLM execution scope cell vocabularies", () => {
    test("custom shapes supply bindings and prompt descriptions without registration", async () => {
        const Node = defineObject({ tag: "Basic", content: "Object" });
        const shape = defineShape({
            theory: "custom-unregistered-theory",
            objects: { Node },
            informal: { RichText },
            supportsEquations: true,
        });
        const binder = createBinder();
        const notebook = await binder.createNotebook(shape, { title: "Custom" });
        const conversation = await binder.createLLMConversation(notebook, "test", {
            title: "Conversation",
        });
        try {
            const scope = await createLLMConversationExecutionScope(conversation, binder);
            try {
                expect(scope.bindings["custom_unregistered_theory_Node"]).toBe(Node);
                expect(scope.bindings["custom_unregistered_theory_RichText"]).toBe(RichText);
                expect(scope.bindings["custom_unregistered_theory_PathEquation"]).toBe(
                    PathEquation,
                );
                expect(scope.systemPromptSuffix).toContain(
                    "`custom_unregistered_theory_Node` (`object`)",
                );
                expect(scope.systemPromptSuffix).toContain(
                    "`custom_unregistered_theory_RichText` (`rich-text`)",
                );
                expect(scope.systemPromptSuffix).toContain(
                    "`custom_unregistered_theory_PathEquation` (`path-equation`)",
                );
            } finally {
                scope.abort();
            }
        } finally {
            conversation.dispose();
            notebook.dispose();
        }
    });

    test("shapes without vocabularies still produce a document execution scope", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook({ theory: "bare" }, { title: "Bare" });
        const conversation = await binder.createLLMConversation(notebook, "test", {
            title: "Conversation",
        });
        try {
            const scope = await createLLMConversationExecutionScope(conversation, binder);
            try {
                expect(Object.keys(scope.bindings)).toEqual(["document_Bare"]);
                expect(scope.systemPromptSuffix).not.toContain("The cell types");
            } finally {
                scope.abort();
            }
        } finally {
            conversation.dispose();
            notebook.dispose();
        }
    });
});
