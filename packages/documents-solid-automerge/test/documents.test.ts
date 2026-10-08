// @vitest-environment happy-dom
import { Repo } from "@automerge/automerge-repo";
import { createComputed, createRoot, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import { createDocumentView } from "../src";

describe("createDocumentView", () => {
    test("requires an owner, shares identity and applies fine-grained patches", async () => {
        const handle = new Repo().create({
            items: [{ id: "first", name: "Initial" }],
            unrelated: 0,
        });
        await handle.whenReady();
        expect(() => createDocumentView(() => handle)).toThrow("Solid owner");

        const off = vi.spyOn(handle, "off");
        const received: string[] = [];
        let view!: { items: Array<{ id: string; name: string }> };
        const dispose = createRoot((dispose) => {
            const projection = createDocumentView(() => handle);
            view = projection() as typeof view;
            createComputed(() => received.push(projection().items[0]?.name ?? "Deleted"));
            return dispose;
        });
        createRoot((disposeShared) => {
            expect(createDocumentView(() => handle)()).toBe(view);
            disposeShared();
        });
        // Let the projection's readiness initialization finish before editing.
        await Promise.resolve();
        const first = view.items[0]!;
        // Unrelated changes do not invalidate readers of other paths.
        handle.change((doc) => {
            doc.unrelated = 1;
        });
        expect(received).toEqual(["Initial"]);
        handle.change((doc) => {
            doc.items[0]!.name = "Updated";
        });
        expect(view.items[0]).toBe(first);
        expect(received).toEqual(["Initial", "Updated"]);
        dispose();
        expect(off).toHaveBeenCalledWith("change", expect.any(Function));
        handle.change((doc) => {
            doc.items.push({ id: "second", name: "Released" });
        });
        expect(received).toEqual(["Initial", "Updated"]);
    });

    test("releases replaced handles and unmounted views", async () => {
        const repo = new Repo();
        const first = repo.create({ name: "First" });
        const second = repo.create({ name: "Second" });
        await Promise.all([first.whenReady(), second.whenReady()]);
        const firstOff = vi.spyOn(first, "off");
        const secondOff = vi.spyOn(second, "off");
        const [handle, setHandle] = createSignal(first);
        const received: string[] = [];
        const dispose = createRoot((dispose) => {
            const view = createDocumentView(handle);
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
});
