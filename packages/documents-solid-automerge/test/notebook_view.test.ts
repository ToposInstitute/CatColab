// @vitest-environment happy-dom
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { createComputed, createRoot, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import {
    createBinder,
    createInMemoryStore,
    PathEquation,
    RichText,
    type EquationCell,
    type MorphismCell,
    type ObjectCell,
    type RichTextCell,
} from "catcolab-documents";
import { createProjectedStore } from "./projected-store";
import { createAutomergeNotebookView } from "./utils/automerge";
import { createNotebookView } from "./utils/notebook";

const objectView = (value: unknown) => value as ObjectCell<typeof Entity>;
const attrView = (value: unknown) => value as MorphismCell<typeof SimpleSchema, typeof Attr>;

describe("reactive bound notebook views", { timeout: 20_000 }, () => {
    test("patch-backed labels, endpoints, equations and rich text retain identity", async () => {
        const store = createProjectedStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = notebook.add(Entity, { label: "Person" });
        const string = notebook.add(AttrType, { label: "String" });
        const other = notebook.add(AttrType, { label: "Other" });
        const name = notebook.add(Attr, { label: "name", from: person, to: string });
        const equation = notebook.add(PathEquation, { label: "eq", lhs: [name], rhs: person });
        const text = notebook.add(RichText, { content: "Hello" });
        const snapshot = store.getDocumentSnapshot(notebook.handle);
        const oldValidation = await notebook.validate();
        const labels: Array<string | undefined> = [];
        const targets: Array<string | undefined> = [];
        const listRuns = vi.fn<(cells: readonly unknown[]) => void>();
        const dispose = createRoot((dispose) => {
            const view = createAutomergeNotebookView(
                () => notebook,
                (bound) => bound.handle.docHandle,
            );
            const original = objectView(view().cell(person.id));
            const morphism = attrView(view().cell(name.id));
            const target = view().cell(string.id);
            const eq = view().cell(equation.id) as EquationCell<typeof SimpleSchema>;
            const rich = view().cell(text.id) as RichTextCell;
            createComputed(() => {
                listRuns(view().cells());
            });
            createComputed(() => {
                labels.push(original.label);
            });
            createComputed(() => {
                targets.push(morphism.to?.label);
            });
            expect(morphism.to).toBe(target);
            expect(eq.lhs).toEqual([morphism]);
            expect(eq.rhs).toBe(original);
            expect(rich.content).toBe("Hello");
            other.update({ label: "Unrelated" });
            notebook.update({ title: "Renamed" });
            expect(view().title).toBe("Renamed");
            expect(labels).toEqual(["Person"]);
            expect(targets).toEqual(["String"]);
            expect(listRuns).toHaveBeenCalledTimes(1);
            string.update({ label: "Text" });
            expect(targets).toEqual(["String", "Text"]);
            original.update({ label: "Human" });
            expect(person.label).toBe("Human");
            expect(labels).toEqual(["Person", "Human"]);
            morphism.update({ to: view().cell(other.id) as ObjectCell<typeof AttrType> });
            expect(name.to?.label).toBe("Unrelated");
            eq.update({ lhs: [morphism], rhs: original });
            expect(equation.rhs).toMatchObject({ id: person.id });
            rich.update({ content: "Updated" });
            expect(text.content).toBe("Updated");
            store.changeDocument(notebook.handle, (doc) => {
                if (doc.type === "model") {
                    const order = [...doc.notebook.cellOrder].toReversed();
                    doc.notebook.cellOrder.splice(0, doc.notebook.cellOrder.length, ...order);
                }
            });
            expect(view().cell(person.id)).toBe(original);
            expect(view().cell(name.id)).toBe(morphism);
            morphism.delete();
            expect(view().cell(name.id)).toBeUndefined();
            expect(morphism.label).toBeUndefined();
            expect(eq.lhs).toEqual([null]);
            return dispose;
        });
        expect(snapshot.document.name).toBe("Schema");
        expect(oldValidation).not.toBe(await notebook.validate());
        expect(oldValidation.model.judgmentsOf(Entity)[0]?.label).toEqual(["Person"]);
        dispose();
        person.update({ label: "Released" });
        expect(labels.at(-1)).toBe("Human");
        notebook.dispose();
    });

    test("kind/type replacement retires wrappers; removed IDs get new wrappers", async () => {
        const store = createProjectedStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const cell = notebook.add(Entity, { label: "Original" });
        const donor = notebook.add(AttrType, { label: "Type" });
        const text = notebook.add(RichText, { content: "Text" });
        const dispose = createRoot((dispose) => {
            const view = createAutomergeNotebookView(
                () => notebook,
                (bound) => bound.handle.docHandle,
            );
            const original = objectView(view().cell(cell.id));
            store.changeDocument(notebook.handle, (doc) => {
                if (doc.type !== "model") {
                    return;
                }
                const judgment = doc.notebook.cellContents[cell.id];
                if (judgment?.tag === "formal" && judgment.content.tag === "object") {
                    judgment.content.obType = AttrType.obType;
                }
            });
            const changed = view().cell(cell.id);
            expect(changed).not.toBe(original);
            expect(original.label).toBeUndefined();
            original.update({ label: "Ignored" });
            expect(cell.label).toBe("Original");
            store.changeDocument(notebook.handle, (doc) => {
                if (doc.type === "model") {
                    doc.notebook.cellContents[cell.id] = structuredClone(
                        notebook.dump().notebook.cellContents[text.id]!,
                    );
                }
            });
            expect(view().cell(cell.id)?.kind).toBe("rich-text");
            expect(view().cell(cell.id)).not.toBe(changed);
            view().cell(cell.id)!.delete();
            expect(view().cell(cell.id)).toBeUndefined();
            store.changeDocument(notebook.handle, (doc) => {
                if (doc.type !== "model") {
                    return;
                }
                doc.notebook.cellContents[cell.id] = structuredClone(
                    notebook.dump().notebook.cellContents[donor.id]!,
                );
                doc.notebook.cellOrder.push(cell.id);
            });
            expect(view().cell(cell.id)).not.toBe(original);
            expect(original.label).toBeUndefined();
            return dispose;
        });
        dispose();
        notebook.dispose();
    });

    test("replacing the source releases views without disposing core commands", async () => {
        const store = createProjectedStore();
        const binder = createBinder(store);
        const first = await binder.createNotebook(SimpleSchema, { title: "First" });
        const cell = first.add(Entity, { label: "First cell" });
        const second = await binder.createNotebook(SimpleSchema, { title: "Second" });
        const firstOff = vi.spyOn(first.handle.docHandle, "off");
        const secondOff = vi.spyOn(second.handle.docHandle, "off");
        const coreDispose = vi.spyOn(first, "dispose");
        const [source, setSource] = createSignal(first);
        const titles: string[] = [];
        const dispose = createRoot((dispose) => {
            const view = createAutomergeNotebookView(source, (bound) => bound.handle.docHandle);
            const stale = objectView(view().cell(cell.id));
            createComputed(() => {
                titles.push(view().title);
            });
            setSource(second);
            expect(stale.label).toBeUndefined();
            stale.update({ label: "Ignored" });
            expect(cell.label).toBe("First cell");
            expect(coreDispose).not.toHaveBeenCalled();
            expect(firstOff).toHaveBeenCalledWith("change", expect.any(Function));
            return dispose;
        });
        second.update({ title: "Updated" });
        expect(titles).toEqual(["First", "Second", "Updated"]);
        dispose();
        expect(secondOff).toHaveBeenCalledWith("change", expect.any(Function));
        first.dispose();
        second.dispose();
    });

    test("non-Automerge fallback reconciles data and filters cells", async () => {
        const binder = createBinder(createInMemoryStore());
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Schema" });
        const person = notebook.add(Entity, { label: "Person" });
        const other = notebook.add(Entity, { label: "Other" });
        const seen: Array<string | undefined> = [];
        const dispose = createRoot((dispose) => {
            const view = createNotebookView(() => notebook);
            const first = objectView(view().cell(person.id));
            createComputed(() => {
                seen.push(first.label);
            });
            other.update({ label: "Unrelated" });
            expect(seen).toEqual(["Person"]);
            first.update({ label: "Updated" });
            expect(seen).toEqual(["Person", "Updated"]);
            expect(view().cellsOf(Entity)).toHaveLength(2);
            expect(view().cellsOf({ objects: [Entity] })[0]).toBe(first);
            return dispose;
        });
        dispose();
        notebook.dispose();
    });
});
