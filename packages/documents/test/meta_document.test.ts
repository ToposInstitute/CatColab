import { SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test, vi } from "vitest";

import { createBinder } from "catcolab-documents";

describe("meta document", () => {
    test("keeps earlier snapshots unchanged when documents are updated", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Before" });
        const before = binder.meta.data();
        expect(binder.meta.data()).toBe(before);

        notebook.update({ title: "After" });
        expect(binder.meta.data().documents[notebook.ref.id]?.name).toBe("After");
        expect(binder.meta.data()).not.toBe(before);
        expect(before.documents[notebook.ref.id]?.name).toBe("Before");
    });

    test("notifies after replacement and supports unsubscribe", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Before" });
        const first = vi.fn<() => void>(() => {
            expect(binder.meta.data().documents[notebook.ref.id]?.name).toBe("After");
        });
        const second = vi.fn<() => void>();
        const stop = binder.meta.onChange(first);
        binder.meta.onChange(second);
        expect(first).not.toHaveBeenCalled();
        notebook.update({ title: "After" });
        expect(first).toHaveBeenCalledOnce();
        expect(second).toHaveBeenCalledOnce();
        stop();
        stop();
        notebook.update({ title: "Unsubscribed" });
        expect(first).toHaveBeenCalledOnce();
        expect(second).toHaveBeenCalledTimes(2);
    });
});
