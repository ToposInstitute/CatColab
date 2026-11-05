import {
    Flow,
    NegativeLink,
    PositiveLink,
    PrimitiveSignedStockFlow,
    Stock,
} from "catcolab-logics/primitive-signed-stock-flow";
import { describe, expect, expectTypeOf, test } from "vitest";

import {
    createBinder,
    createInMemoryStore,
    type MorphismCellData,
    type MorphismCellPatch,
} from "catcolab-documents";

describe("stock-flow influence links", { timeout: 20000 }, () => {
    test.each([
        ["positive", PositiveLink],
        ["negative", NegativeLink],
    ] as const)("creates a %s link from a stock to a flow", async (_, linkType) => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(PrimitiveSignedStockFlow, {
            title: "Caffeine cycle",
        });
        const beans = notebook.add(Stock, { label: "Coffee beans" });
        const coffee = notebook.add(Stock, { label: "Brewed coffee" });
        const brewing = notebook.add(Flow, { label: "brewing", from: beans, to: coffee });

        const link = notebook.add(linkType, {
            label: "influences brewing",
            from: beans,
            to: brewing,
        });

        expectTypeOf<
            Parameters<typeof notebook.add<typeof linkType>>[1]["to"]
        >().toEqualTypeOf<MorphismCellData<typeof Flow> | null>();
        expectTypeOf<
            MorphismCellPatch<typeof PrimitiveSignedStockFlow, typeof linkType>["to"]
        >().toEqualTypeOf<MorphismCellData<typeof Flow> | null | undefined>();
        expect(store.getDocumentSnapshot(notebook.handle)).toMatchObject({
            notebook: {
                cellContents: {
                    [link.id]: {
                        content: {
                            cod: {
                                tag: "Tabulated",
                                content: { tag: "Basic", content: brewing.generatorId },
                            },
                        },
                    },
                },
            },
        });
        expect(link.to).toMatchObject({ kind: "morphism", id: brewing.id });
        expect(notebook.cellsOf(linkType)).toMatchObject([
            { id: link.id, from: { id: beans.id }, to: { id: brewing.id } },
        ]);
        const result = await notebook.validate();
        expect(result.issues).toEqual([]);
        expect(result.model.judgmentsOf(linkType)).toMatchObject([
            { from: { id: beans.generatorId }, to: { id: brewing.generatorId } },
        ]);
        notebook.dispose();
    });

    test.each([
        ["positive", PositiveLink],
        ["negative", NegativeLink],
    ] as const)("updates and reloads a %s link targeting a flow", async (_, linkType) => {
        const store = createInMemoryStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(PrimitiveSignedStockFlow, { title: "Cycle" });
        const beans = notebook.add(Stock, { label: "Beans" });
        const coffee = notebook.add(Stock, { label: "Coffee" });
        const brewing = notebook.add(Flow, { label: "brewing", from: beans, to: coffee });
        const link = notebook.add(linkType, { label: "influence", from: beans, to: null });
        notebook.update(link, { to: brewing });
        expect(link.to).toBeNull();
        expect(notebook.data().cells.find((cell) => cell.id === link.id)).toMatchObject({
            to: { id: brewing.id },
        });
        const loaded = await binder.loadNotebookFromRef(
            PrimitiveSignedStockFlow,
            binder.getDocumentRef(notebook.handle),
        );
        expect(loaded.tag).toBe("Ok");
        if (loaded.tag === "Err") {
            throw new Error("Expected notebook to load");
        }
        expect(loaded.content.cellsOf(linkType)).toMatchObject([{ to: { id: brewing.id } }]);
        const result = await loaded.content.validate();
        expect(result.issues).toEqual([]);
        expect(result.model.judgmentsOf(linkType)).toMatchObject([
            { to: { id: brewing.generatorId } },
        ]);
        notebook.update(link, { to: null });
        expect(notebook.cellsOf(linkType)).toMatchObject([{ to: null }]);
        expect((await notebook.validate()).issues.length).toBeGreaterThan(0);
        loaded.content.dispose();
        notebook.dispose();
    });

    test("reports wrong morphism types and malformed stored endpoints", async () => {
        const store = createInMemoryStore();
        const notebook = await createBinder(store).createNotebook(PrimitiveSignedStockFlow, {
            title: "Cycle",
        });
        const beans = notebook.add(Stock, { label: "Beans" });
        const coffee = notebook.add(Stock, { label: "Coffee" });
        const brewing = notebook.add(Flow, { label: "brewing", from: beans, to: coffee });
        const positive = notebook.add(PositiveLink, {
            label: "positive",
            from: beans,
            to: brewing,
        });
        notebook.add(NegativeLink, { label: "negative", from: beans, to: positive as never });
        expect((await notebook.validate()).issues).toContainEqual(
            expect.objectContaining({ message: "Morphism `negative` has a mistyped codomain" }),
        );
        store.changeDocument(notebook.handle, (document) => {
            if (document.type !== "model") {
                throw new Error("Expected a model");
            }
            const cell = document.notebook.cellContents[positive.id];
            if (cell?.tag !== "formal" || cell.content.tag !== "morphism") {
                throw new Error("Expected a morphism");
            }
            cell.content.cod = { tag: "Basic", content: coffee.generatorId };
        });
        expect((await notebook.validate()).issues).toContainEqual({
            message: "Morphism `positive` has a codomain that is not a tabulated morphism",
            path: ["notebook", "cellContents", positive.id, "content", "cod"],
        });
        notebook.dispose();
    });

    test("rejects wrong-kind and missing flow targets without changing the notebook", async () => {
        const notebook = await createBinder().createNotebook(PrimitiveSignedStockFlow, {
            title: "Cycle",
        });
        const beans = notebook.add(Stock, { label: "Beans" });
        const coffee = notebook.add(Stock, { label: "Coffee" });
        const brewing = notebook.add(Flow, { label: "brewing", from: beans, to: coffee });
        const link = notebook.add(PositiveLink, { label: "influence", from: beans, to: brewing });
        const before = notebook.data();
        expect(() =>
            notebook.add(PositiveLink, { label: "bad", from: beans, to: coffee as never }),
        ).toThrow(`Cell ${coffee.id} is not a morphism.`);
        expect(() => notebook.update(link, { to: coffee as never })).toThrow(
            `Cell ${coffee.id} is not a morphism.`,
        );
        expect(() =>
            notebook.add(Flow, { label: "bad", from: beans, to: brewing as never }),
        ).toThrow(`Cell ${brewing.id} is not an object.`);
        expect(notebook.data()).toBe(before);
        notebook.delete(brewing);
        expect(notebook.cellsOf(PositiveLink)).toMatchObject([{ to: null }]);
        const afterDelete = notebook.data();
        expect(() => notebook.update(link, { to: brewing })).toThrow(
            `Cell ${brewing.id} does not exist.`,
        );
        expect(notebook.data()).toBe(afterDelete);
        expect((await notebook.validate()).issues.length).toBeGreaterThan(0);
        notebook.dispose();
    });
});
