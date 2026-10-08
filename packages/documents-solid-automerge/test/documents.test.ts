// @vitest-environment happy-dom
import { Repo } from "@automerge/automerge-repo";
import { createComputed, createRoot, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import type { Document } from "catcolab-document-types";
import { createInMemoryStore } from "catcolab-documents";
import { createAutomergeDocumentView } from "../src/automerge";
import { createDocumentAccessor, createDocumentSelector, createDocumentView } from "../src/index";

const document = (): Document => ({
    type: "instance",
    name: "Initial",
    version: "1",
    tables: {},
    instanceOf: { _id: "schema", _version: null, _server: "", type: "instance-of" },
});

describe("explicit Solid document adapters", () => {
    test("Automerge projections share identity and apply fine-grained patches", async () => {
        const repo = new Repo();
        const handle = repo.create({ items: [{ id: "first", name: "Initial" }], unrelated: 0 });
        await handle.whenReady();
        expect(() => createAutomergeDocumentView(() => handle)).toThrow("Solid owner");
        const off = vi.spyOn(handle, "off");
        const received: string[] = [];
        let view!: ReturnType<typeof handle.doc>;
        const dispose = createRoot((dispose) => {
            const projection = createAutomergeDocumentView(() => handle);
            view = projection();
            createComputed(() => received.push(projection().items[0]?.name ?? "Deleted"));
            return dispose;
        });
        const disposeShared = createRoot((dispose) => {
            expect(createAutomergeDocumentView(() => handle)()).toBe(view);
            return dispose;
        });
        // Let the projection's readiness initialization finish before editing.
        await Promise.resolve();
        const first = view.items[0];
        handle.change((doc) => {
            doc.unrelated = 1;
        });
        expect(received).toEqual(["Initial"]);
        handle.change((doc) => {
            doc.items[0]!.name = "Updated";
        });
        expect(view.items[0]).toBe(first);
        expect(received).toEqual(["Initial", "Updated"]);
        disposeShared();
        expect(off).not.toHaveBeenCalled();
        handle.change((doc) => {
            doc.items.splice(0, 1);
        });
        expect(received).toEqual(["Initial", "Updated", "Deleted"]);
        dispose();
        expect(off).toHaveBeenCalledWith("change", expect.any(Function));
        handle.change((doc) => {
            doc.items.push({ id: "second", name: "Released" });
        });
        expect(received).toEqual(["Initial", "Updated", "Deleted"]);
    });

    test("Automerge projections release replaced handles and unmounted views", async () => {
        const repo = new Repo();
        const first = repo.create({ name: "First" });
        const second = repo.create({ name: "Second" });
        await Promise.all([first.whenReady(), second.whenReady()]);
        const firstOff = vi.spyOn(first, "off");
        const secondOff = vi.spyOn(second, "off");
        const [handle, setHandle] = createSignal(first);
        const received: string[] = [];
        const dispose = createRoot((dispose) => {
            const view = createAutomergeDocumentView(handle);
            createComputed(() => received.push(view().name));
            return dispose;
        });
        await Promise.resolve();
        setHandle(second);
        await Promise.resolve();
        expect(firstOff).toHaveBeenCalledWith("change", expect.any(Function));
        first.change((doc) => {
            doc.name = "Ignored";
        });
        second.change((doc) => {
            doc.name = "Latest";
        });
        expect(received).toEqual(["First", "Second", "Latest"]);
        dispose();
        expect(secondOff).toHaveBeenCalledWith("change", expect.any(Function));
        second.change((doc) => {
            doc.name = "Released";
        });
        expect(received).toEqual(["First", "Second", "Latest"]);
    });

    test("snapshot accessors require ownership and unsubscribe on cleanup", async () => {
        const store = createInMemoryStore();
        const handle = await store.createHandle(document());
        expect(() => createDocumentAccessor(store, handle)).toThrow("Solid owner");
        const received: string[] = [];
        const dispose = createRoot((dispose) => {
            const snapshot = createDocumentAccessor(store, handle);
            createComputed(() => received.push(snapshot().document.name));
            return dispose;
        });
        store.changeDocument(handle, (doc) => {
            doc.name = "Updated";
        });
        dispose();
        store.changeDocument(handle, (doc) => {
            doc.name = "Released";
        });
        expect(received).toEqual(["Initial", "Updated"]);
    });

    test("frontend projections preserve IDs and fine-grained dependencies", () => {
        const listeners = new Set<() => void>();
        let data = { items: [{ id: "first", name: "Initial" }], unrelated: 0 };
        const source = {
            onChange(callback: () => void) {
                listeners.add(callback);
                return () => {
                    listeners.delete(callback);
                };
            },
        };
        const received: string[] = [];
        const dispose = createRoot((dispose) => {
            const view = createDocumentView(source, () => data);
            const first = view.items[0];
            createComputed(() => received.push(view.items[0]!.name));
            data = { ...data, unrelated: 1 };
            for (const listener of listeners) {
                listener();
            }
            expect(received).toEqual(["Initial"]);
            data = {
                items: [
                    { id: "first", name: "Updated" },
                    { id: "second", name: "New" },
                ],
                unrelated: 1,
            };
            for (const listener of listeners) {
                listener();
            }
            expect(view.items[0]).toBe(first);
            expect(received).toEqual(["Initial", "Updated"]);
            return dispose;
        });
        dispose();
        expect(listeners.size).toBe(0);
    });

    test("selectors resubscribe when the facade changes", () => {
        function source(title: string) {
            const listeners = new Set<() => void>();
            const stop = vi.fn<() => void>();
            return {
                title,
                stop,
                onChange(callback: () => void) {
                    listeners.add(callback);
                    return () => {
                        listeners.delete(callback);
                        stop();
                    };
                },
                rename(value: string) {
                    this.title = value;
                    for (const listener of listeners) {
                        listener();
                    }
                },
            };
        }
        const first = source("First");
        const second = source("Second");
        const [current, setCurrent] = createSignal(first);
        const received: string[] = [];
        const dispose = createRoot((dispose) => {
            const title = createDocumentSelector(current, () => current().title);
            createComputed(() => received.push(title()));
            return dispose;
        });
        first.rename("Renamed");
        setCurrent(second);
        expect(first.stop).toHaveBeenCalledTimes(1);
        first.rename("Ignored");
        second.rename("Latest");
        dispose();
        expect(second.stop).toHaveBeenCalledTimes(1);
        second.rename("Released");
        expect(received).toEqual(["First", "Renamed", "Second", "Latest"]);
    });
});
