import { Repo } from "@automerge/automerge-repo";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import type { DeepReadonly } from "catcolab-documents";
import { createInMemoryStore } from "catcolab-documents";
import { getDocumentSnapshot } from "./helpers/snapshot";

const document = (): Document => ({
    type: "instance",
    name: "Initial",
    version: "1",
    tables: {},
    instanceOf: { _id: "schema", _version: null, _server: "", type: "instance-of" },
});

interface Fixture {
    read(): DeepReadonly<object>;
    rename(name: string): void;
    subscribe(callback: () => void): () => void;
    dispose(): Promise<void>;
}

const fixtures: Record<string, () => Promise<Fixture>> = {
    memory: async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(document());
        return {
            read: () => store.getDocumentSnapshot(handle),
            rename: (name) =>
                store.changeDocument(handle, (doc) => {
                    doc.name = name;
                }),
            subscribe: (callback) =>
                store.subscribe(handle, (changedHandle) => {
                    expect(changedHandle).toBe(handle);
                    callback();
                }),
            dispose: async () => {},
        };
    },
    automerge: async () => {
        const repo = new Repo();
        const handle = repo.create(document());
        return {
            read: () => getDocumentSnapshot(handle.doc()),
            rename: (name) =>
                handle.change((doc) => {
                    doc.name = name;
                }),
            subscribe: (callback) => {
                const onChange = () => callback();
                handle.on("change", onChange);
                return () => handle.off("change", onChange);
            },
            dispose: () => repo.shutdown(),
        };
    },
};

for (const [name, create] of Object.entries(fixtures)) {
    describe(`${name} snapshot contract`, () => {
        test("stable, detached reads update without any subscribers", async () => {
            const fixture = await create();
            try {
                const before = fixture.read();
                expect(fixture.read()).toBe(before);
                expect(() => structuredClone(before)).not.toThrow();
                fixture.rename("New");
                const after = fixture.read();
                expect(after).not.toBe(before);
                expect(after).toMatchObject({ name: "New" });
                expect(before).toMatchObject({ name: "Initial" });
                expect(fixture.read()).toBe(after);
            } finally {
                await fixture.dispose();
            }
        });

        test("publishes before listeners, has no initial delivery, and unsubscribes", async () => {
            const fixture = await create();
            try {
                const received: DeepReadonly<object>[] = [];
                const stop = fixture.subscribe(() => {
                    const snapshot = fixture.read();
                    expect(fixture.read()).toBe(snapshot);
                    received.push(snapshot);
                });
                expect(received).toEqual([]);
                fixture.rename("New");
                expect(received).toEqual([fixture.read()]);
                stop();
                stop();
                fixture.rename("Unobserved");
                expect(received).toHaveLength(1);
                expect(fixture.read()).toMatchObject({ name: "Unobserved" });
            } finally {
                await fixture.dispose();
            }
        });
    });
}
