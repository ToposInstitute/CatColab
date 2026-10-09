import { Repo } from "@automerge/automerge-repo";
import { describe, expect, test, vi } from "vitest";

import type { Document } from "catcolab-document-types";
import { createInMemoryStore } from "catcolab-documents";
import { parsedInstanceTables, parsedSnapshotTables } from "../src/instance/parsed-source";
import { getDocumentSnapshot } from "./helpers/snapshot";

function document(): Document {
    return {
        type: "instance",
        name: "Data",
        version: "1",
        instanceOf: { _id: "schema", _version: null, _server: "", type: "instance-of" },
        tables: { entity: { rows: { first: { fields: {} } }, rowOrder: ["first"] } },
    };
}

describe("snapshot-derived instance parsing", () => {
    test("reuses parsing without subscriptions and never mutates older results", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(document());
        const subscribe = vi.spyOn(store, "subscribe");
        const before = parsedInstanceTables(store, handle);
        for (let index = 0; index < 10; index += 1) {
            expect(parsedInstanceTables(store, handle)).toBe(before);
        }
        store.changeDocument(handle, (doc) => {
            if (doc.type === "instance") {
                doc.tables["entity"]!.rows["stray"] = { fields: {} };
            }
        });
        const after = parsedInstanceTables(store, handle);
        expect(after.value["entity"]?.rowOrder).toEqual(["first", "stray"]);
        expect(after.issues).toHaveLength(1);
        expect(before.value["entity"]?.rowOrder).toEqual(["first"]);
        expect(subscribe).not.toHaveBeenCalled();
    });

    test("commits/undo publish before callbacks, independent of parsing order", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(document());
        const observed: string[][] = [];
        // Subscribe before any parsing; there is no hidden cache listener.
        const unsubscribe = store.subscribe(handle, (snapshot) => {
            expect(snapshot).toBe(store.getDocumentSnapshot(handle));
            observed.push([...parsedInstanceTables(store, handle).value["entity"]!.rowOrder]);
        });
        const draft = store.createDraft(handle);
        store.changeDocument(draft, (doc) => {
            if (doc.type === "instance") {
                doc.tables["entity"]!.rowOrder = [];
            }
        });
        const change = store.commitDraft(handle, draft);
        expect(parsedInstanceTables(store, handle).issues).toHaveLength(1);
        expect(handle.type === "instance" && handle.tables["entity"]?.rowOrder).toEqual([]);
        store.revertCommit(handle, change);
        expect(parsedInstanceTables(store, handle).issues).toEqual([]);
        expect(observed).toEqual([["first"], ["first"]]);
        unsubscribe();
    });

    test("fatal damage clears the view and a subsequent valid edit recovers", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(document());
        store.changeDocument(handle, (doc) => {
            (doc as unknown as { name: unknown }).name = null;
        });
        expect(parsedInstanceTables(store, handle).value).toEqual({});
        expect(parsedInstanceTables(store, handle).issues[0]?.message).toContain("name");
        store.changeDocument(handle, (doc) => {
            doc.name = "Recovered";
        });
        expect(parsedInstanceTables(store, handle).value["entity"]?.rowOrder).toEqual(["first"]);
        expect(parsedInstanceTables(store, handle).issues).toEqual([]);
    });

    test("Automerge local edits and remote merges work without projections", async () => {
        const repo = new Repo();
        try {
            const handle = repo.create(document());
            const read = (source: typeof handle) => getDocumentSnapshot(source.doc());
            const before = read(handle);
            expect(read(handle)).toBe(before);
            handle.change((doc) => {
                if (doc.type === "instance") {
                    doc.tables["entity"]!.rows["local"] = { fields: {} };
                }
            });
            expect(parsedSnapshotTables(read(handle)).value["entity"]?.rowOrder).toEqual([
                "first",
                "local",
            ]);
            const remote = repo.clone(handle);
            remote.change((doc) => {
                if (doc.type === "instance") {
                    doc.tables["entity"]!.rows["remote"] = { fields: {} };
                }
            });
            handle.merge(remote);
            expect(parsedSnapshotTables(read(handle)).value["entity"]?.rowOrder).toEqual([
                "first",
                "local",
                "remote",
            ]);
            expect(parsedSnapshotTables(before).value["entity"]?.rowOrder).toEqual(["first"]);
        } finally {
            await repo.shutdown();
        }
    });
});
