import { Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// Transactions: a set of changes staged on drafts, invisible on the
// source documents until committed, and revertible as a whole via the returned
// commit.
import { createBinder, type Result } from "catcolab-documents";

function expectOk<T, E>(result: Result<T, E>): T {
    expect(result.tag).toBe("Ok");
    if (result.tag === "Err") {
        throw new Error(`Expected Ok result: ${String(result.content)}`);
    }
    return result.content;
}

describe("transactions", () => {
    test(
        "changes stage on drafts, apply on commit and revert as a batch",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

            const { tx, draftDocs } = await binder.beginTransaction({ schema });
            draftDocs.schema.add(Entity, { label: "Person" });
            draftDocs.schema.add(Entity, { label: "Company" });

            // The source notebook is untouched while the transaction is open.
            expect(schema.cellsOf(Entity).length).toBe(0);
            expect(draftDocs.schema.cellsOf(Entity).map((cell) => cell.label)).toEqual([
                "Person",
                "Company",
            ]);

            const commit = tx.commit();
            expect([...commit.documents.keys()]).toEqual([schema]);
            expect(commit.documents.has(schema)).toBe(true);
            expect(commit.documents.has(draftDocs.schema)).toBe(false);
            expect(schema.cellsOf(Entity).map((cell) => cell.label)).toEqual(["Person", "Company"]);

            const reloaded = expectOk(await binder.loadNotebookFromRef(SimpleSchema, schema.ref));
            expect(() => reloaded.revert(commit)).toThrow("not part of the commit");
            reloaded.dispose();
            schema.revert(commit);
            expect(schema.cellsOf(Entity).length).toBe(0);
        },
    );

    test("a draft instance is bound to the draft of its schema", { timeout: 20_000 }, async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        schema.add(Entity, { label: "Person" });
        const instance = expectOk(
            await binder.createInstance(schema, { title: "Company instance" }),
        );

        const { tx, draftDocs } = await binder.beginTransaction({ schema, instance });
        draftDocs.schema.add(Entity, { label: "Company" });

        // The draft instance derives its tables from the draft schema...
        expect((await draftDocs.instance.validate()).tables.map((table) => table.label)).toEqual([
            "Person",
            "Company",
        ]);
        // ...while the real instance still sees the real schema.
        expect((await instance.validate()).tables.map((table) => table.label)).toEqual(["Person"]);

        const commit = tx.commit();
        expect(commit.documents.size).toBe(2);
        expect(commit.documents.has(schema)).toBe(true);
        expect(commit.documents.has(instance)).toBe(true);
        expect(commit.documents.has(draftDocs.instance)).toBe(false);
        expect((await instance.validate()).tables.map((table) => table.label)).toEqual([
            "Person",
            "Company",
        ]);
    });

    test(
        "binds draft conversations to the drafts of their attachments",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });
            const inner = await binder.createLLMConversation(schema, "test-model", {
                title: "Inner",
            });
            const outer = await binder.createLLMConversation(inner, "test-model", {
                title: "Outer",
            });

            const { tx, draftDocs } = await binder.beginTransaction({ schema, inner, outer });

            // Each draft conversation is attached to the draft of the document
            // it is attached to.
            expect(draftDocs.inner.attachment).toBe(draftDocs.schema);
            expect(draftDocs.outer.attachment).toBe(draftDocs.inner);

            draftDocs.outer.update({ title: "Renamed" });
            expect(outer.title).toBe("Outer");

            tx.commit();
            expect(outer.title).toBe("Renamed");
            expect(inner.title).toBe("Inner");
        },
    );

    test(
        "stages a conversation on its own, attached to the real document",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });
            const conversation = await binder.createLLMConversation(schema, "test-model", {
                title: "Conversation",
            });

            const { tx, draftDocs } = await binder.beginTransaction({ conversation });

            const draft = draftDocs.conversation;
            expect(draft.attachment.ref).toEqual(schema.ref);

            draft.update({ title: "Renamed" });
            tx.commit();
            expect(conversation.title).toBe("Renamed");
        },
    );

    test(
        "abort discards the staged drafts without touching the sources",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

            const { tx, draftDocs } = await binder.beginTransaction({ schema });
            draftDocs.schema.add(Entity, { label: "Person" });

            tx.abort();
            expect(schema.cellsOf(Entity).length).toBe(0);
        },
    );

    test(
        "commit and abort are mutually exclusive one-shot operations",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

            const committed = await binder.beginTransaction({ schema });
            committed.tx.commit();
            expect(() => committed.tx.commit()).toThrow(/already been committed/);
            expect(() => committed.tx.abort()).toThrow(/already been committed/);

            const aborted = await binder.beginTransaction({ schema });
            aborted.tx.abort();
            expect(() => aborted.tx.abort()).toThrow(/already been aborted/);
            expect(() => aborted.tx.commit()).toThrow(/already been aborted/);
            expect(schema.cellsOf(Entity).length).toBe(0);
        },
    );

    test("drafts resolve by their own refs while their sources stay committed", async () => {
        const binder = createBinder();
        const schema = await binder.createNotebook(SimpleSchema, { title: "Example schema" });

        const { tx, draftDocs } = await binder.beginTransaction({ schema });
        const draftRef = draftDocs.schema.ref;

        // The draft's own ref resolves to the draft, while the source's ref
        // keeps resolving to the committed document.
        draftDocs.schema.update({ title: "Draft schema" });
        const resolvedDraft = expectOk(await binder.getDocumentSnapshotFromRef(draftRef));
        expect(resolvedDraft.name).toBe("Draft schema");
        const resolvedSource = expectOk(await binder.getDocumentSnapshotFromRef(schema.ref));
        expect(resolvedSource.name).toBe("Example schema");

        tx.commit();
        // Once committed, the draft's ref no longer resolves.
        expect((await binder.getDocumentSnapshotFromRef(draftRef)).tag).toBe("Err");
    });

    test(
        "an instance staged without its schema resolves the schema from outside the transaction",
        { timeout: 20_000 },
        async () => {
            const binder = createBinder();
            const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
            schema.add(Entity, { label: "Person" });
            const instance = expectOk(
                await binder.createInstance(schema, { title: "Company instance" }),
            );

            const { tx, draftDocs } = await binder.beginTransaction({ instance });
            const tables = (await draftDocs.instance.validate()).tables;
            const personTable = tables.find((table) => table.label === "Person");
            expect(personTable).toBeDefined();
            if (personTable === undefined) {
                return;
            }

            const row = expectOk(await draftDocs.instance.addRow(personTable));
            expect(instance.dump().tables[personTable.id]?.rows[row.id]).toBeUndefined();

            const commit = tx.commit();
            expect(instance.dump().tables[personTable.id]?.rowOrder).toEqual([row.id]);

            const reloaded = expectOk(await binder.loadInstanceFromRef(schema, instance.ref));
            expect(() => reloaded.revert(commit)).toThrow("not part of the commit");
            reloaded.dispose();
            instance.revert(commit);
            // Reverting restores the exact pre-commit state, where the table
            // did not exist yet at all.
            expect(instance.dump().tables[personTable.id]).toBeUndefined();
        },
    );
});
