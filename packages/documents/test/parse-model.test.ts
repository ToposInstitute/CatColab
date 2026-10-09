import { Repo } from "@automerge/automerge-repo";
import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, expect, test, vi } from "vitest";

import type { Document } from "catcolab-document-types";
import {
    createBinder,
    createInMemoryStore,
    parseModelDocument,
    parseModelNotebook,
    PathEquation,
    RichText,
    type Result,
} from "catcolab-documents";
import { findModelReferenceCellId, parseModelSnapshot } from "../src/model/parsed-source";
import { getDocumentSnapshot } from "./helpers/snapshot";

const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const c = "00000000-0000-0000-0000-000000000003";
const basic = { tag: "Basic", content: "Object" };

function ok<T, E>(result: Result<T, E>): T {
    if (result.tag === "Err") {
        throw new Error(`Expected Ok: ${String(result.content)}`);
    }
    return result.content;
}
function objectCell(id = a) {
    return { tag: "formal", id, content: { tag: "object", id: b, name: "A", obType: basic } };
}
function document(notebook: unknown = { cellContents: { [a]: objectCell() }, cellOrder: [a] }) {
    return { type: "model", name: "Model", theory: "simple-olog", version: "2", notebook };
}

function parseNotebook(cell: unknown) {
    return parseModelNotebook({ cellContents: { [a]: cell }, cellOrder: [a] });
}

describe("model structural parsing", () => {
    test("well-formed notebooks retain identity and distinct generator IDs", () => {
        const raw = document();
        const parsed = ok(parseModelDocument(raw));
        expect(parsed.issues).toEqual([]);
        expect(parsed.value.notebook).toBe(raw.notebook);
        expect(parsed.value.notebook.cellContents[a]).toEqual(objectCell());
    });

    test.each([null, [], "model", { type: "instance" }])(
        "rejects a non-model document: %s",
        (value) => {
            expect(parseModelDocument(value).tag).toBe("Err");
        },
    );

    test("fatal metadata errors have root-relative paths", () => {
        const result = parseModelDocument({ ...document(), name: null, theory: [] });
        expect(result.tag === "Err" && result.content.map((issue) => issue.path)).toEqual([
            ["name"],
            ["theory"],
        ]);
    });

    test.each([null, {}, { cellContents: [], cellOrder: "bad" }])(
        "repairs malformed notebook containers: %s",
        (notebook) => {
            const parsed = ok(parseModelDocument(document(notebook)));
            expect(parsed.value.notebook.cellContents).toEqual({});
            expect(parsed.value.notebook.cellOrder).toEqual([]);
            expect(parsed.issues.length).toBeGreaterThan(0);
            expect(parsed.issues.every((issue) => issue.path[0] === "notebook")).toBe(true);
        },
    );

    test("repairs duplicates, ghosts, missing entries and malformed cells without modifying storage", () => {
        const raw = {
            cellContents: {
                [a]: objectCell(),
                [b]: null,
                [c]: { tag: "rich-text", id: c, content: "Hello" },
            },
            cellOrder: [a, a, b, "ghost", 3],
            extra: "preserved",
        };
        const parsed = parseModelNotebook(raw);
        expect(parsed.value.cellOrder).toEqual([a, c]);
        expect(Object.keys(parsed.value.cellContents)).toEqual([a, c]);
        expect(parsed.issues.map((issue) => issue.path)).toEqual([
            ["notebook", "cellContents", b],
            ["notebook", "cellOrder", 1],
            ["notebook", "cellOrder", 3],
            ["notebook", "cellOrder", 4],
            ["notebook", "cellContents", c],
        ]);
        expect(parsed.value).toMatchObject({ extra: "preserved" });
        expect(raw.cellOrder).toEqual([a, a, b, "ghost", 3]);
        expect(raw.cellContents[b]).toBeNull();
    });

    test("repairs cell IDs using map keys, not generator IDs", () => {
        const cell = objectCell(c);
        const parsed = parseNotebook(cell);
        expect(parsed.value.cellContents[a]?.id).toBe(a);
        expect(parsed.value.cellContents[a]).toMatchObject({ content: { id: b } });
        expect(parsed.issues[0]?.path).toEqual(["notebook", "cellContents", a, "id"]);
        expect(cell.id).toBe(c);
    });

    test.each([
        { tag: "unknown", id: a, content: {} },
        { tag: "formal", id: a, content: null },
        { tag: "formal", id: a, content: { ...objectCell().content, tag: "unknown" } },
        { tag: "formal", id: a, content: { ...objectCell().content, name: 42 } },
        { tag: "formal", id: a, content: { ...objectCell().content, id: null } },
    ])("drops malformed envelopes with diagnostic paths", (cell) => {
        const parsed = parseNotebook(cell);
        expect(parsed.value.cellOrder).toEqual([]);
        expect(parsed.value.cellContents).toEqual({});
        expect(parsed.issues.length).toBeGreaterThan(0);
        expect(
            parsed.issues.every(
                (issue) => issue.path.slice(0, 3).join("/") === `notebook/cellContents/${a}`,
            ),
        ).toBe(true);
    });

    test.each([
        { ...objectCell(), content: { ...objectCell().content, obType: null } },
        { ...objectCell(), content: { ...objectCell().content, obType: { tag: "FutureType" } } },
        { tag: "formal", id: a, content: { tag: "morphism", id: b, name: "f", dom: 3 } },
        {
            tag: "formal",
            id: a,
            content: {
                tag: "equation",
                id: b,
                name: "e",
                lhs: { tag: "Composite", content: { tag: "Seq", content: [null] } },
            },
        },
        {
            tag: "formal",
            id: a,
            content: { tag: "instantiation", id: b, name: "i", model: {}, specializations: "bad" },
        },
        { tag: "rich-text", id: a, content: [{ type: "text", value: 3 }] },
    ])("preserves unchecked payloads for downstream consumers", (cell) => {
        const parsed = parseNotebook(cell);
        expect(parsed.issues).toEqual([]);
        expect(parsed.value.cellContents[a]).toBe(cell);
    });

    test("IDs are opaque strings at the notebook boundary", () => {
        const cell = {
            ...objectCell("cell"),
            content: { ...objectCell().content, id: "generator" },
        };
        const raw = { cellContents: { cell }, cellOrder: ["cell"] };
        const parsed = parseModelNotebook(raw);
        expect(parsed.issues).toEqual([]);
        expect(parsed.value).toBe(raw);
        expect(findModelReferenceCellId(parsed.value, "object", "generator")).toBe("cell");
    });

    test("reference indexes preserve first-match semantics and are scoped to notebook identity", () => {
        const contents = { [a]: objectCell(a), [c]: objectCell(c) };
        const first = parseModelNotebook({ cellContents: contents, cellOrder: [a, c] }).value;
        const reordered = parseModelNotebook({ cellContents: contents, cellOrder: [c, a] }).value;
        expect(findModelReferenceCellId(first, "object", b)).toBe(a);
        expect(findModelReferenceCellId(first, "morphism", b)).toBeUndefined();
        expect(findModelReferenceCellId(reordered, "object", b)).toBe(c);
        expect(findModelReferenceCellId(first, "object", b)).toBe(a);
    });

    test("does not traverse expression payloads", () => {
        const type: { tag: string; content?: unknown } = { tag: "Tabulator" };
        type.content = { tag: "Hom", content: type };
        const cell = { ...objectCell(), content: { ...objectCell().content, obType: type } };
        const parsed = parseNotebook(cell);
        expect(parsed.issues).toEqual([]);
        expect(parsed.value.cellContents[a]).toBe(cell);
    });
});

describe("parsed model notebook integration", { timeout: 20_000 }, () => {
    test("preserves damaged expressions, reads them safely, and reports Wasm failures", async () => {
        const store = createInMemoryStore();
        const notebook = await createBinder(store).createNotebook(SimpleOlog, { title: "Model" });
        const object = notebook.add(Type, { label: "A" });
        const morphism = notebook.add(Aspect, { label: "f", from: object, to: object });
        const equation = notebook.add(PathEquation, { label: "e", lhs: [morphism] });
        store.changeDocument(notebook.handle, (doc) => {
            if (doc.type === "model") {
                const contents = doc.notebook.cellContents;
                for (const [id, field, value] of [
                    [object.id, "obType", { tag: "ModeApp", content: null }],
                    [morphism.id, "dom", { tag: "Basic", content: 3 }],
                    [
                        equation.id,
                        "lhs",
                        { tag: "Composite", content: { tag: "Seq", content: [null] } },
                    ],
                ] as const) {
                    (contents[id]!.content as unknown as Record<string, unknown>)[field] = value;
                }
            }
        });
        const parsed = ok(parseModelSnapshot(store.getDocumentSnapshot(notebook.handle)));
        expect(parsed.issues).toEqual([]);
        expect(parsed.value.notebook.cellOrder).toHaveLength(3);
        expect(notebook.cells().map((cell) => cell.id)).toEqual([morphism.id, equation.id]);
        expect(object.label).toBe("A");
        expect(morphism.from).toBeNull();
        expect(morphism.to).toBeNull(); // The referenced object has no representable type.
        expect(equation.lhs).toEqual([null]);
        expect(
            (await notebook.validate()).issues.some((issue) =>
                issue.message.includes("Failed to elaborate model"),
            ),
        ).toBe(true);
        expect(notebook.dump().notebook.cellOrder).toHaveLength(3);
        notebook.dispose();
    });

    test.each(["missing", "duplicate", "malformed"])(
        "deletes cells despite %s order entries without persisting unrelated repairs",
        async (damage) => {
            const store = createInMemoryStore();
            const notebook = await createBinder(store).createNotebook(SimpleOlog, {
                title: "Model",
            });
            const object = notebook.add(Type, { label: "A" });
            store.changeDocument(notebook.handle, (doc) => {
                if (doc.type === "model") {
                    (doc.notebook as unknown as { cellOrder: unknown }).cellOrder =
                        damage === "missing"
                            ? []
                            : damage === "duplicate"
                              ? [object.id, object.id]
                              : "bad";
                }
            });
            expect(notebook.cells()).toHaveLength(1);
            object.delete();
            expect(notebook.cells()).toEqual([]);
            expect(notebook.document.notebook.cellContents[object.id]).toBeUndefined();
            expect(notebook.document.notebook.cellOrder).toEqual(
                damage === "malformed" ? "bad" : [],
            );
            notebook.dispose();
        },
    );

    test("Automerge local edits and remote merges select fresh parsed snapshots", async () => {
        const repo = new Repo();
        try {
            const handle = repo.create(document() as Document);
            const read = (source: typeof handle) => getDocumentSnapshot(source.doc());
            const before = parseModelSnapshot(read(handle));
            expect(parseModelSnapshot(read(handle))).toBe(before);
            handle.change((doc) => {
                if (doc.type === "model") {
                    doc.notebook.cellOrder = [];
                }
            });
            const local = parseModelSnapshot(read(handle));
            expect(ok(local).value.notebook.cellOrder).toEqual([a]);
            expect(ok(local).issues).toHaveLength(1);
            const remote = repo.clone(handle);
            remote.change((doc) => {
                if (doc.type === "model") {
                    doc.notebook.cellContents[c] = { tag: "rich-text", id: c, content: "Remote" };
                }
            });
            handle.merge(remote);
            const merged = parseModelSnapshot(read(handle));
            expect(ok(merged).value.notebook.cellOrder).toEqual([a, c]);
            expect(ok(before).value.notebook.cellOrder).toEqual([a]);
            expect(ok(before).issues).toEqual([]);
            expect(ok(local).value.notebook.cellOrder).toEqual([a]);
        } finally {
            await repo.shutdown();
        }
    });
    test("loads repaired notebooks, reads them safely and combines structural/semantic issues", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Model" });
        const object = notebook.add(Type, { label: "A" });
        notebook.add(Aspect, { label: "dangling", from: null, to: null });
        store.changeDocument(notebook.handle, (doc) => {
            if (doc.type === "model") {
                doc.notebook.cellOrder.push(object.id, a);
                (doc.notebook.cellContents as Record<string, unknown>)[a] = {
                    tag: "formal",
                    id: a,
                    content: null,
                };
            }
        });
        const loaded = ok(
            await binder.loadNotebookFromRef(SimpleOlog, binder.getDocumentRef(notebook.handle)),
        );
        expect(loaded.cells()).toHaveLength(2);
        const validation = await loaded.validate();
        expect(
            validation.issues.some(
                (issue) => issue.path?.[0] === "notebook" && issue.path?.[1] === "cellOrder",
            ),
        ).toBe(true);
        expect(
            validation.issues.some((issue) => issue.message.includes("Morphism `dangling`")),
        ).toBe(true);
        expect(validation.model.judgmentsOf(Type)).toHaveLength(1);
        expect(loaded.dump().notebook.cellOrder).toHaveLength(4);
        loaded.dispose();
        notebook.dispose();
    });

    test("cell facades resolve generator IDs, read repaired order, retire on fatal damage and recover", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Model" });
        const object = notebook.add(Type, { label: "A" });
        const morphism = notebook.add(Aspect, { label: "f", from: object, to: object });
        const text = notebook.add(RichText, { content: "Hello" });
        store.changeDocument(notebook.handle, (doc) => {
            if (doc.type === "model") {
                doc.notebook.cellOrder = [];
            }
        });
        expect(notebook.cells().map((cell) => cell.id)).toEqual([object.id, morphism.id, text.id]);
        expect(morphism.from?.id).toBe(object.id);
        expect(text.content).toBe("Hello");
        const storedNotebook = notebook.dump().notebook;
        store.changeDocument(notebook.handle, (doc) => {
            (doc as unknown as { notebook: unknown }).notebook = null;
        });
        expect(notebook.cells()).toEqual([]);
        expect(object.label).toBeUndefined();
        expect(text.content).toBeUndefined();
        expect(() => object.update({ label: "Ignored" })).not.toThrow();
        expect(() => object.delete()).not.toThrow();
        expect(() => text.update({ content: "Ignored" })).not.toThrow();
        expect(notebook.document.notebook).toBeNull();
        store.changeDocument(notebook.handle, (doc) => {
            if (doc.type === "model") {
                doc.notebook = storedNotebook;
            }
        });
        expect(object.label).toBe("A");
        store.changeDocument(notebook.handle, (doc) => {
            (doc as unknown as { name: unknown }).name = null;
        });
        expect(
            (await binder.loadNotebookFromRef(SimpleOlog, binder.getDocumentRef(notebook.handle)))
                .tag,
        ).toBe("Err");
        expect(notebook.cells()).toEqual([]);
        expect(notebook.title).toBe("");
        expect(object.label).toBeUndefined();
        expect(morphism.from).toBeUndefined();
        expect(text.content).toBeUndefined();
        expect((await notebook.validate()).issues[0]?.path).toEqual(["name"]);
        object.update({ label: "Ignored" });
        store.changeDocument(notebook.handle, (doc) => {
            doc.name = "Recovered";
        });
        expect(object.label).toBe("A");
        expect(morphism.from?.id).toBe(object.id);
        notebook.dispose();
    });

    test("shares immutable snapshot parsing without subscriptions; drafts, commit and undo refresh it", async () => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleOlog, { title: "Model" });
        const object = notebook.add(Type, { label: "A" });
        const subscribe = vi.spyOn(store, "subscribe");
        const before = parseModelSnapshot(store.getDocumentSnapshot(notebook.handle));
        expect(parseModelSnapshot(store.getDocumentSnapshot(notebook.handle))).toBe(before);
        expect(subscribe).not.toHaveBeenCalled();
        const draft = store.createDraft(notebook.handle);
        store.changeDocument(draft, (doc) => {
            if (doc.type === "model") {
                doc.notebook.cellOrder = [];
            }
        });
        const repaired = ok(parseModelSnapshot(store.getDocumentSnapshot(draft)));
        expect(repaired.value.notebook.cellOrder).toEqual([object.id]);
        expect(Object.isFrozen(repaired.value.notebook.cellOrder)).toBe(true);
        expect(parseModelSnapshot(store.getDocumentSnapshot(notebook.handle))).toBe(before);
        const change = store.commitDraft(notebook.handle, draft);
        const after = parseModelSnapshot(store.getDocumentSnapshot(notebook.handle));
        expect(after).not.toBe(before);
        expect(ok(after).issues).toHaveLength(1);
        expect(ok(before).issues).toEqual([]);
        store.revertCommit(notebook.handle, change);
        expect(ok(parseModelSnapshot(store.getDocumentSnapshot(notebook.handle))).issues).toEqual(
            [],
        );
        store.discardDraft(draft);
        const abandoned = store.createDraft(notebook.handle);
        store.changeDocument(abandoned, (doc) => {
            doc.name = "Abandoned";
        });
        store.discardDraft(abandoned);
        expect(notebook.title).toBe("Model");
        notebook.dispose();
    });
});
