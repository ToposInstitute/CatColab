import { SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Diagram } from "catcolab-document-methods";
import { createBinder, createInMemoryStore } from "catcolab-documents";

describe("private document handles", { timeout: 20_000 }, () => {
    test("documents expose IDs and binder operations preserve identity without exposing handles", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const result = await binder.createInstance(notebook, { title: "Data" });
        if (result.tag === "Err") {
            throw new Error("Expected an instance");
        }
        const instance = result.content;
        const conversation = await binder.createLLMConversation(instance, "test-model", {
            title: "Conversation",
        });

        expectTypeOf<Extract<keyof typeof notebook, "handle">>().toEqualTypeOf<never>();
        expectTypeOf<Extract<keyof typeof instance, "handle">>().toEqualTypeOf<never>();
        expectTypeOf<Extract<keyof typeof conversation, "handle">>().toEqualTypeOf<never>();
        expectTypeOf<
            Extract<keyof typeof binder, "handleOf" | "getHandle">
        >().toEqualTypeOf<never>();
        expect("handleOf" in binder).toBe(false);
        expect("getHandle" in binder).toBe(false);

        for (const document of [notebook, instance, conversation]) {
            expect("handle" in document).toBe(false);
            expectTypeOf(document.id).toEqualTypeOf<string>();
            const ref = binder.getDocumentRef(document);
            expect(document.id).toBe(ref.id);
            expect(await binder.getDocumentSnapshotFromRef(ref)).toEqual({
                tag: "Ok",
                content: binder.getDocumentSnapshot(document),
            });
        }

        const ref = binder.getDocumentRef(notebook);
        const loaded = await binder.loadNotebookFromRef(SimpleSchema, ref);
        if (loaded.tag === "Err") {
            throw new Error("Expected a notebook");
        }
        expect(binder.getDocumentRef(loaded.content)).toEqual(ref);
        expect("handle" in loaded.content).toBe(false);
        expect(loaded.content.id).toBe(notebook.id);

        const loadedInstance = await binder.loadInstanceFromRef(
            notebook,
            binder.getDocumentRef(instance),
        );
        const loadedConversation = await binder.loadLLMConversationFromRef(
            instance,
            binder.getDocumentRef(conversation),
        );
        if (loadedInstance.tag === "Err" || loadedConversation.tag === "Err") {
            throw new Error("Expected loaded documents");
        }
        expect(loadedInstance.content.id).toBe(instance.id);
        expect(loadedConversation.content.id).toBe(conversation.id);
        await expect(binder.beginTransaction({ notebook, loaded: loaded.content })).rejects.toThrow(
            "A document appears more than once",
        );

        const { tx, draftDocs } = await binder.beginTransaction({
            notebook,
            instance,
            conversation,
        });
        for (const [key, document] of Object.entries(draftDocs)) {
            expect("handle" in document).toBe(false);
            expect(document.id).toBe(binder.getDocumentRef(document).id);
            expect(document.id).not.toBe(
                { notebook, instance, conversation }[key as keyof typeof draftDocs].id,
            );
        }
        expect(draftDocs.conversation.attachment).toBe(draftDocs.instance);
        tx.abort();
    });

    test("document operations require a binder sharing the document store", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const sharedBinder = createBinder(store);
        const foreignBinder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });

        expect(sharedBinder.getDocumentRef(notebook)).toEqual(binder.getDocumentRef(notebook));
        expect(sharedBinder.getDocumentSnapshot(notebook)).toBe(
            binder.getDocumentSnapshot(notebook),
        );
        expect(() => foreignBinder.getDocumentRef(notebook)).toThrow("not bound to this store");
        expect(() => binder.getDocumentRef({ ...notebook })).toThrow("not bound to this store");
        expect(() => foreignBinder.getDocumentSnapshot(notebook)).toThrow(
            "not bound to this store",
        );
        expect(() => binder.getDocumentSnapshot({ ...notebook })).toThrow(
            "not bound to this store",
        );
        await expect(foreignBinder.listUsedBy(notebook)).rejects.toThrow("not bound to this store");
        await expect(foreignBinder.listDependsOn(notebook)).rejects.toThrow(
            "not bound to this store",
        );
        await expect(foreignBinder.beginTransaction({ notebook })).rejects.toThrow(
            "not bound to this store",
        );
    });

    test("reference lookups can inspect documents without a supported view", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const diagram = await store.createHandle(
            Diagram.newDiagramDocument({ _id: notebook.id, _version: null, _server: "" }),
        );
        expect(await binder.getDocumentSnapshotFromRef(store.getDocumentRef(diagram))).toEqual({
            tag: "Ok",
            content: store.getDocumentSnapshot(diagram),
        });
        expect((await binder.listUsedBy(notebook))["diagram-in"]).toEqual([
            store.getDocumentRef(diagram),
        ]);
    });

    test("relation queries return references and reference lookups report missing documents", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const result = await binder.createInstance(notebook, { title: "Data" });
        if (result.tag === "Err") {
            throw new Error("Expected an instance");
        }
        const instance = result.content;
        const conversation = await binder.createLLMConversation(instance, "test-model", {
            title: "Conversation",
        });
        expect((await binder.listUsedBy(notebook))["instance-of"]).toEqual([
            binder.getDocumentRef(instance),
        ]);
        expect((await binder.listDependsOn(instance))["instance-of"]).toEqual([
            binder.getDocumentRef(notebook),
        ]);
        expect((await binder.listUsedBy(instance))["llmconversation-of"]).toEqual([
            binder.getDocumentRef(conversation),
        ]);
        expect(
            (await binder.getDocumentSnapshotFromRef({ id: "missing", version: null })).tag,
        ).toBe("Err");
    });
});
