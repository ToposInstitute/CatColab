import { toJS } from "@automerge/automerge";
import { Repo } from "@automerge/automerge-repo";
import { describe, expect, test } from "vitest";

import type { Document } from "catcolab-document-types";
import type { DeepReadonly } from "catcolab-documents";
import { createInMemoryStore } from "catcolab-documents";
import { createSnapshotReader } from "./helpers/snapshot_reader";

const document = (): Document => ({
    type: "instance",
    name: "Initial",
    version: "1",
    tables: {},
    instanceOf: { _id: "schema", _version: null, _server: "", type: "instance-of" },
});

interface Fixture {
    read(): DeepReadonly<Document>;
    rename(name: string): void;
    subscribe(callback: (snapshot: DeepReadonly<Document>) => void): () => void;
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
            subscribe: (callback) => store.subscribe(handle, callback),
            dispose: async () => {},
        };
    },
    automerge: async () => {
        const repo = new Repo();
        const handle = repo.create(document());
        const snapshotOf = createSnapshotReader<Document>(
            (doc) => doc,
            (doc) => toJS<Document>(doc as Document),
        );
        return {
            read: () => snapshotOf(handle.doc()),
            rename: (name) =>
                handle.change((doc) => {
                    doc.name = name;
                }),
            subscribe: (callback) => {
                const onChange = ({ doc }: { doc: Document }) => callback(snapshotOf(doc));
                handle.on("change", onChange);
                return () => handle.off("change", onChange);
            },
            dispose: () => repo.shutdown(),
        };
    },
};

for (const [name, create] of Object.entries(fixtures)) {
    describe(`${name} snapshot contract`, () => {
        test("stable, immutable reads update without any subscribers", async () => {
            const fixture = await create();
            try {
                const before = fixture.read();
                expect(fixture.read()).toBe(before);
                expect(Object.isFrozen(before)).toBe(true);
                expect(() => structuredClone(before)).not.toThrow();
                fixture.rename("New");
                const after = fixture.read();
                expect(after).not.toBe(before);
                expect(after.name).toBe("New");
                expect(before.name).toBe("Initial");
                expect(fixture.read()).toBe(after);
            } finally {
                await fixture.dispose();
            }
        });

        test("publishes before listeners, has no initial delivery, and unsubscribes", async () => {
            const fixture = await create();
            try {
                const received: DeepReadonly<Document>[] = [];
                const stop = fixture.subscribe((snapshot) => {
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
                expect(fixture.read().name).toBe("Unobserved");
            } finally {
                await fixture.dispose();
            }
        });

        test("reentrant edits cannot mutate another event's snapshot", async () => {
            const fixture = await create();
            try {
                const received: string[] = [];
                const stopFirst = fixture.subscribe((snapshot) => {
                    if (snapshot.name === "Outer") {
                        fixture.rename("Inner");
                    }
                });
                const stopSecond = fixture.subscribe((snapshot) => received.push(snapshot.name));
                fixture.rename("Outer");
                expect(received).toEqual(["Outer", "Inner"]);
                expect(fixture.read().name).toBe("Inner");
                stopFirst();
                stopSecond();
            } finally {
                await fixture.dispose();
            }
        });
    });
}
