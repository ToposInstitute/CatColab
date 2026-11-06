import { describe, expect, test } from "vitest";

import {
    cellTypeVocabularies,
    createBinder,
    defineObject,
    defineShape,
    PathEquation,
    RichText,
} from "catcolab-documents";

const Node = defineObject({ tag: "Basic", content: "Object" });

describe("collecting document cell vocabularies", () => {
    test("custom shapes provide bindings without theory registration or loading", async () => {
        const shape = defineShape({
            theory: "custom",
            objects: { Node },
            informal: { RichText },
            supportsEquations: true,
            getCoreTheory: async () => {
                throw new Error("Core theory must not be loaded");
            },
        });
        const binder = createBinder();
        const notebook = await binder.createNotebook(shape, { title: "Custom" });
        try {
            const vocabularies = cellTypeVocabularies([notebook]);
            expect(vocabularies).toHaveLength(1);
            expect(vocabularies[0]).toBe(shape.cellTypes);
            expect(vocabularies[0]).toEqual({ Node, RichText, PathEquation });
        } finally {
            notebook.dispose();
        }
    });

    test("shared vocabularies are deduplicated in first-seen order, not by theory name", async () => {
        const first = defineShape({ theory: "custom", objects: { Node } });
        const second = defineShape({ theory: "custom", objects: { Other: Node } });
        const binder = createBinder();
        const a = await binder.createNotebook(first, { title: "A" });
        const b = await binder.createNotebook(second, { title: "B" });
        const c = await binder.createNotebook(first, { title: "C" });
        try {
            const { tx, draftDocs } = await binder.beginTransaction({ a, b, c });
            try {
                const vocabularies = cellTypeVocabularies(Object.values(draftDocs));
                expect(vocabularies).toHaveLength(2);
                expect(vocabularies[0]).toBe(first.cellTypes);
                expect(vocabularies[1]).toBe(second.cellTypes);
            } finally {
                tx.abort();
            }
        } finally {
            a.dispose();
            b.dispose();
            c.dispose();
        }
    });

    test("instances contribute their schema vocabulary", async () => {
        const shape = defineShape({
            theory: "custom",
            objects: { Node },
            getCoreTheory: async () => {
                throw new Error("Core theory must not be loaded");
            },
            supportsInstances: { tableObjects: [Node] },
        });
        const binder = createBinder();
        const notebook = await binder.createNotebook(shape, { title: "Custom" });
        const result = await binder.createInstance(notebook, { title: "Instance" });
        expect(result.tag).toBe("Ok");
        if (result.tag !== "Ok") {
            throw new Error("Expected an instance");
        }
        const instance = result.content;
        try {
            expect(cellTypeVocabularies([instance])[0]).toBe(shape.cellTypes);
            expect(cellTypeVocabularies([notebook, instance])).toHaveLength(1);
        } finally {
            instance.dispose();
            notebook.dispose();
        }
    });

    test("missing vocabularies and documents without shapes are skipped", async () => {
        const binder = createBinder();
        const bare = await binder.createNotebook({ theory: "bare" }, { title: "Bare" });
        const conversation = await binder.createLLMConversation(bare, "test", {
            title: "Conversation",
        });
        try {
            expect(cellTypeVocabularies([])).toEqual([]);
            expect(cellTypeVocabularies([bare, conversation])).toEqual([]);
        } finally {
            conversation.dispose();
            bare.dispose();
        }
    });
});
