// @vitest-environment happy-dom
import { createComputed, createRoot, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import type { Document } from "catcolab-document-types";
import { createInMemoryStore } from "catcolab-documents";
import { createDocumentAccessor, createDocumentSelector, createDocumentView } from "./reactivity";

const document = (): Document => ({
    type: "instance",
    name: "Initial",
    version: "1",
    tables: {},
    instanceOf: { _id: "schema", _version: null, _server: "", type: "instance-of" },
});

describe("explicit Solid document adapters", () => {
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
