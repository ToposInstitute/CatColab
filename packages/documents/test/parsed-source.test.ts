import { Repo } from "@automerge/automerge-repo";
import { makeDocumentProjection } from "solid-automerge";
import { createComputed, createRoot, createSignal } from "solid-js";
import { unwrap } from "solid-js/store";
import { describe, expect, test, vi } from "vitest";

import type { Document } from "catcolab-document-types";
import { createInMemoryStore } from "catcolab-documents";
import { parsedInstanceTables, retainParsedInstance } from "../src/instance/parsed-source";

function document(): Document {
    return {
        type: "instance",
        name: "Data",
        version: "1",
        instanceOf: { _id: "schema", _version: null, _server: "", type: "instance-of" },
        tables: { entity: { rows: { first: { fields: {} } }, rowOrder: ["first"] } },
    };
}

describe("change-driven instance parsing", () => {
    test("shares one parse/subscription and never reparses on reads", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(document());
        const copies = vi.spyOn(store, "copyValue");
        const subscribe = vi.spyOn(store, "subscribe");
        const release = retainParsedInstance(store, handle);
        const releaseOther = retainParsedInstance(store, handle);
        expect(copies).toHaveBeenCalledTimes(1);
        expect(subscribe).toHaveBeenCalledTimes(1);

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
        expect(copies).toHaveBeenCalledTimes(2);

        release();
        store.changeDocument(handle, (doc) => {
            doc.name = "Renamed";
        });
        expect(copies).toHaveBeenCalledTimes(3);
        releaseOther();
        releaseOther();
        store.changeDocument(handle, (doc) => {
            doc.name = "Released";
        });
        expect(copies).toHaveBeenCalledTimes(3);
        const releaseAgain = retainParsedInstance(store, handle);
        expect(copies).toHaveBeenCalledTimes(4);
        releaseAgain();
    });

    test("repairs recover and commits/undo refresh before downstream callbacks", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(document());
        const release = retainParsedInstance(store, handle);
        const observed: string[][] = [];
        const unsubscribe = store.subscribe(handle, () => {
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
        release();
    });

    test("fatal damage clears the view and a subsequent valid edit recovers", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(document());
        const release = retainParsedInstance(store, handle);
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
        release();
    });

    test("Automerge local edits and remote merges refresh a reactive cached view", async () => {
        const repo = new Repo();
        try {
            const docHandle = repo.create(document());
            const store = createInMemoryStore();
            const handle = await store.createHandle(document());
            const { projection, disposeProjection } = createRoot((disposeProjection) => ({
                projection: makeDocumentProjection(docHandle),
                disposeProjection,
            }));
            const [revision, setRevision] = createSignal(0);
            store.getDocumentView = () => projection;
            store.copyValue = (_handle, value) => structuredClone(unwrap(value));
            store.getDocumentRevision = () => revision();
            store.subscribe = (_handle, callback) => {
                const onChange = () => {
                    callback();
                    setRevision((value) => value + 1);
                };
                docHandle.on("change", onChange);
                return () => docHandle.off("change", onChange);
            };
            const copies = vi.spyOn(store, "copyValue");
            const release = retainParsedInstance(store, handle);
            const observed: string[][] = [];
            const dispose = createRoot((disposeRoot) => {
                createComputed(() => {
                    observed.push([
                        ...parsedInstanceTables(store, handle).value["entity"]!.rowOrder,
                    ]);
                });
                return disposeRoot;
            });
            docHandle.change((doc) => {
                if (doc.type === "instance") {
                    doc.tables["entity"]!.rows["local"] = { fields: {} };
                }
            });
            expect(observed.at(-1)).toEqual(["first", "local"]);
            const remote = repo.clone(docHandle);
            remote.change((doc) => {
                if (doc.type === "instance") {
                    doc.tables["entity"]!.rows["remote"] = { fields: {} };
                }
            });
            docHandle.merge(remote);
            expect(observed.at(-1)).toEqual(["first", "local", "remote"]);
            expect(copies).toHaveBeenCalledTimes(3);
            dispose();
            release();
            docHandle.change((doc) => {
                doc.name = "Released";
            });
            expect(copies).toHaveBeenCalledTimes(3);
            disposeProjection();
        } finally {
            await repo.shutdown();
        }
    });
});
