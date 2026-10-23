import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { createRenderEffect, createRoot, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vitest";

// @vitest-environment happy-dom
import { LLMConversation } from "catcolab-document-methods";
import { createBinder, createInMemoryStore } from "catcolab-documents";
import { createDocumentDataView } from "../src";

describe("Solid document data", () => {
    test("updates snapshot-backed titles and cells synchronously", async () => {
        const binder = createBinder(createInMemoryStore());
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Original" });
        const cell = notebook.add(Type, { label: "A" });
        const observed: string[] = [];
        const dispose = createRoot((dispose) => {
            const data = createDocumentDataView(() => notebook);
            createRenderEffect(() => {
                const first = data().cells[0];
                observed.push(`${data().name}/${first?.kind === "object" ? first.label : ""}`);
            });
            return dispose;
        });
        notebook.update({ title: "Renamed" });
        notebook.update(cell, { label: "B" });
        expect(observed).toEqual(["Original/A", "Renamed/A", "Renamed/B"]);
        dispose();
        notebook.update(cell, { label: "C" });
        expect(observed).toHaveLength(3);
        notebook.dispose();
    });

    test("tracks persisted interactions and feedback resolution", async () => {
        const binder = createBinder(createInMemoryStore());
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Model" });
        const conversation = await binder.createLLMConversation(notebook, "test-model", {
            title: "Conversation",
        });
        const dispose = createRoot((dispose) => {
            const data = createDocumentDataView(() => conversation);
            const before = data();
            conversation.appendInteraction(LLMConversation.newUserMessage("Hello", []));
            expect(data().interactions).toHaveLength(1);
            expect(before.interactions).toEqual([]);
            conversation.appendInteraction({
                tag: "user-feedback-request",
                id: "feedback",
                timestamp: new Date().toISOString(),
                codeExecution: "execution",
                content: "Apply changes?",
                resolution: "unresolved",
            });
            const pending = data();
            conversation.resolveFeedbackRequest("feedback", "approved");
            expect(data().interactions.at(-1)).toMatchObject({ resolution: "approved" });
            expect(pending.interactions.at(-1)).toMatchObject({ resolution: "unresolved" });
            conversation.update({ title: "Renamed" });
            expect(data().name).toBe("Renamed");
            return dispose;
        });
        dispose();
        conversation.dispose();
        notebook.dispose();
    });

    test("releases subscriptions when the document is replaced and on cleanup", () => {
        const firstStop = vi.fn<() => void>();
        const secondStop = vi.fn<() => void>();
        const first = {
            data: () => "first",
            onChange: vi.fn<() => () => void>(() => firstStop),
        };
        const second = {
            data: () => "second",
            onChange: vi.fn<() => () => void>(() => secondStop),
        };
        const dispose = createRoot((dispose) => {
            const [document, setDocument] = createSignal(first);
            const data = createDocumentDataView(document);
            expect(data()).toBe("first");
            setDocument(second);
            expect(data()).toBe("second");
            expect(firstStop).toHaveBeenCalledOnce();
            expect(secondStop).not.toHaveBeenCalled();
            return dispose;
        });
        dispose();
        expect(secondStop).toHaveBeenCalledOnce();
    });
});
