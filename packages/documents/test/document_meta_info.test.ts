import { SimpleSchema } from "catcolab-logics/simple-schema";
import { parse as uuidParse } from "uuid";
import { describe, expect, test, vi } from "vitest";

import {
    createBinder,
    createInMemoryStore,
    type DocInfo,
    type MetaDocumentData,
    type RelatedDocuments,
} from "catcolab-documents";

function grouped(overrides: Partial<RelatedDocuments> = {}): RelatedDocuments {
    return {
        "analysis-of": [],
        "diagram-in": [],
        "instance-of": [],
        "llmconversation-of": [],
        instantiation: [],
        ...overrides,
    };
}

async function fixture() {
    const binder = createBinder();
    const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
    const result = await binder.createInstance(notebook, { title: "Instance" });
    if (result.tag === "Err") {
        throw new Error("Expected instance");
    }
    const instance = result.content;
    const conversation = await binder.createLLMConversation(instance, "test", {
        title: "Conversation",
    });
    return { binder, notebook, instance, conversation };
}

function documentInfo(name: string): DocInfo {
    return {
        name,
        typeName: "model",
        createdAt: 123,
        deletedAt: null,
        dependsOn: [],
        usedBy: [],
    };
}

describe("document meta info", () => {
    test("queries only one hop in either direction and filters links", async () => {
        const { binder, notebook, instance, conversation } = await fixture();
        expect(binder.listRelatedDocuments(notebook.ref, { direction: "both" })).toEqual(
            grouped({
                "instance-of": [
                    expect.objectContaining({
                        ref: { id: instance.ref.id, version: null },
                        typeName: "instance",
                        name: "Instance",
                    }),
                ],
            }),
        );
        expect(binder.listRelatedDocuments(notebook.ref, { direction: "depends-on" })).toEqual(
            grouped(),
        );
        expect(binder.listRelatedDocuments(instance.ref, { direction: "depends-on" })).toEqual(
            grouped({
                "instance-of": [
                    expect.objectContaining({ ref: { id: notebook.ref.id, version: null } }),
                ],
            }),
        );
        expect(binder.listRelatedDocuments(instance.ref, { direction: "used-by" })).toEqual(
            grouped({
                "llmconversation-of": [
                    expect.objectContaining({ ref: { id: conversation.ref.id, version: null } }),
                ],
            }),
        );
        expect(binder.listRelatedDocuments(conversation.ref, { direction: "depends-on" })).toEqual(
            grouped({
                "llmconversation-of": [
                    expect.objectContaining({ ref: { id: instance.ref.id, version: null } }),
                ],
            }),
        );
        expect(binder.listRelatedDocuments(instance.ref, { direction: "both", links: [] })).toEqual(
            grouped(),
        );
        expect(
            binder.listRelatedDocuments(instance.ref, {
                direction: "both",
                links: ["instance-of"],
            }),
        ).toEqual(
            grouped({
                "instance-of": [
                    expect.objectContaining({ ref: { id: notebook.ref.id, version: null } }),
                ],
            }),
        );
        expect(
            binder.listRelatedDocuments(instance.ref, {
                direction: "both",
                links: ["llmconversation-of"],
            }),
        ).toEqual(
            grouped({
                "llmconversation-of": [
                    expect.objectContaining({ ref: { id: conversation.ref.id, version: null } }),
                ],
            }),
        );
    });

    test("subscribes to metadata changes across documents", async () => {
        const { binder, notebook, instance } = await fixture();
        const listener = vi.fn<() => void>();
        const stop = binder.meta.onChange(listener);
        expect(listener).not.toHaveBeenCalled();
        notebook.update({ title: "Renamed schema" });
        instance.update({ title: "Renamed instance" });
        expect(listener).toHaveBeenCalledTimes(2);
        stop();
        notebook.update({ title: "Unsubscribed" });
        expect(listener).toHaveBeenCalledTimes(2);
    });

    test("filters missing, deleted, unknown, duplicate, and self relations", async () => {
        const store = createInMemoryStore();
        let snapshot = store.meta.data();
        const binder = createBinder({
            ...store,
            meta: { data: () => snapshot, onChange: () => () => {} },
        });
        const origin = await binder.createNotebook(SimpleSchema, { title: "Origin" });
        const target = await binder.createNotebook(SimpleSchema, { title: "Target" });
        const deleted = await binder.createNotebook(SimpleSchema, { title: "Deleted" });
        const relation = (id: string, relationType = "instance-of") => ({
            refId: uuidParse(id),
            relationType,
        });
        const data: MetaDocumentData = {
            profile: { username: null, displayName: null },
            knownUsers: {},
            documents: {
                [origin.ref.id]: {
                    ...documentInfo("Origin"),
                    dependsOn: [
                        relation(target.ref.id),
                        relation(origin.ref.id),
                        relation(crypto.randomUUID()),
                        relation(deleted.ref.id),
                    ],
                    usedBy: [
                        relation(target.ref.id),
                        relation(target.ref.id, "instantiation"),
                        relation(deleted.ref.id, "unknown"),
                    ],
                },
                [target.ref.id]: documentInfo("Target"),
                [deleted.ref.id]: { ...documentInfo("Deleted"), deletedAt: 456 },
            },
        };
        snapshot = data;
        expect(binder.listRelatedDocuments(origin.ref, { direction: "both" })).toEqual(
            grouped({
                "instance-of": [
                    {
                        ref: { id: target.ref.id, version: null },
                        typeName: "model",
                        name: "Target",
                        createdAt: 123,
                    },
                ],
                instantiation: [
                    expect.objectContaining({
                        ref: { id: target.ref.id, version: null },
                        name: "Target",
                    }),
                ],
            }),
        );
        data.documents[deleted.ref.id]!.deletedAt = null;
        expect(
            binder.listRelatedDocuments(origin.ref, { direction: "both" })["instance-of"],
        ).toHaveLength(2);
        data.documents[origin.ref.id]!.dependsOn = [];
        data.documents[origin.ref.id]!.usedBy = [];
        expect(binder.listRelatedDocuments(origin.ref, { direction: "both" })).toEqual(grouped());
    });
});
