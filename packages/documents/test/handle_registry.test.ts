import { SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Diagram } from "catcolab-document-methods";
import { createBinder, createInMemoryStore, type DocumentRef } from "catcolab-documents";

describe("private document handles", { timeout: 20_000 }, () => {
    test("documents expose refs and binder operations preserve identity without exposing handles", async () => {
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
        expect("handleOf" in binder).toBe(false);
        expect("getHandle" in binder).toBe(false);

        for (const document of [notebook, instance, conversation]) {
            expect("handle" in document).toBe(false);
            expectTypeOf(document.ref).toEqualTypeOf<Readonly<DocumentRef>>();
            expect(await binder.getDocumentSnapshotFromRef(document.ref)).toEqual({
                tag: "Ok",
                content: document.dump(),
            });
        }

        const loaded = await binder.loadNotebookFromRef(SimpleSchema, notebook.ref);
        if (loaded.tag === "Err") {
            throw new Error("Expected a notebook");
        }
        expect(loaded.content.ref).toEqual(notebook.ref);
        expect("handle" in loaded.content).toBe(false);

        const loadedInstance = await binder.loadInstanceFromRef(notebook, instance.ref);
        const loadedConversation = await binder.loadLLMConversationFromRef(
            instance,
            conversation.ref,
        );
        if (loadedInstance.tag === "Err" || loadedConversation.tag === "Err") {
            throw new Error("Expected loaded documents");
        }
        expect(loadedInstance.content.ref).toEqual(instance.ref);
        expect(loadedConversation.content.ref).toEqual(conversation.ref);
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
            expect(document.ref.id).not.toBe(
                { notebook, instance, conversation }[key as keyof typeof draftDocs].ref.id,
            );
            expect(await binder.getDocumentSnapshotFromRef(document.ref)).toEqual({
                tag: "Ok",
                content: document.dump(),
            });
        }
        expect(draftDocs.conversation.attachment).toBe(draftDocs.instance);
        tx.abort();
    });

    test("a loaded document exposes the store's full reference", async () => {
        const store = createInMemoryStore();
        const notebook = await createBinder(store).createNotebook(SimpleSchema, {
            title: "Schema",
        });
        const ref = { id: notebook.ref.id, version: "revision", server: "test-server" };
        const binder = createBinder({
            ...store,
            getHandle: (requested) => store.getHandle({ id: requested.id, version: null }),
            getDocumentRef: (handle) => ({ ...ref, id: store.getDocumentRef(handle).id }),
        });

        const loaded = await binder.loadNotebookFromRef(SimpleSchema, ref);
        if (loaded.tag === "Err") {
            throw new Error("Expected a notebook");
        }
        expect(loaded.content.ref).toEqual(ref);
    });

    test("document operations require a binder sharing the document store", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const sharedBinder = createBinder(store);
        const foreignBinder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });

        expect(await sharedBinder.listUsedBy(notebook)).toEqual(await binder.listUsedBy(notebook));
        await expect(binder.listUsedBy({ ...notebook })).rejects.toThrow("not bound to this store");
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
            Diagram.newDiagramDocument({ _id: notebook.ref.id, _version: null, _server: "" }),
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
        expect((await binder.listUsedBy(notebook))["instance-of"]).toEqual([instance.ref]);
        expect((await binder.listDependsOn(instance))["instance-of"]).toEqual([notebook.ref]);
        expect((await binder.listUsedBy(instance))["llmconversation-of"]).toEqual([
            conversation.ref,
        ]);
        expect(
            (await binder.getDocumentSnapshotFromRef({ id: "missing", version: null })).tag,
        ).toBe("Err");
    });
});
