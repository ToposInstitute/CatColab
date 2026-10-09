import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test, vi } from "vitest";

import {
    createBinder,
    createCellReadView,
    createInMemoryStore,
    type ObjectCell,
    RichText,
} from "catcolab-documents";
import { readModelSnapshot } from "../src/model/parsed-source";

describe("cell read views", () => {
    test("getters read current values without replacing the handle", async () => {
        const notebook = await createBinder().createNotebook(SimpleOlog, { title: "Model" });
        const object = notebook.add(Type, { label: "Before" });
        const text = notebook.add(RichText, { content: "Before" });

        expect(Object.getOwnPropertyDescriptor(object, "label")?.get).toBeTypeOf("function");
        expect(Object.getOwnPropertyDescriptor(text, "content")?.get).toBeTypeOf("function");
        object.update({ label: "After" });
        text.update({ content: "After" });
        expect(object.label).toBe("After");
        expect(text.content).toBe("After");
        notebook.dispose();
    });

    test("guards commands while retired and keeps the command hook", async () => {
        const store = createInMemoryStore();
        const notebook = await createBinder(store).createNotebook(SimpleOlog, { title: "Model" });
        const object = notebook.add(Type, { label: "A" });
        const document = readModelSnapshot(store.getDocumentSnapshot(notebook.handle));
        let source = document;
        const update = vi.fn<ObjectCell<typeof Type>["update"]>();
        const remove = vi.fn<() => void>();
        const runCommand = vi.fn<(command: () => void) => void>((command) => command());
        const view = createCellReadView<ObjectCell<typeof Type>>(
            { kind: "object", id: object.id, type: Type, update, delete: remove },
            () => source,
            undefined,
            runCommand,
        );

        source = undefined;
        expect(view.label).toBeUndefined();
        view.update({ label: "Ignored" });
        view.delete();
        expect(update).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();

        source = document;
        expect(view.label).toBe("A");
        view.update({ label: "B" });
        view.delete();
        expect(update).toHaveBeenCalledWith({ label: "B" });
        expect(remove).toHaveBeenCalledOnce();
        expect(runCommand).toHaveBeenCalledTimes(4);
        notebook.dispose();
    });
});
