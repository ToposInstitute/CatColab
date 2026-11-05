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
    ] as const)("creates and updates a %s link targeting a flow", async (_, linkType) => {
        const notebook = await createBinder().createNotebook(PrimitiveSignedStockFlow, {
            title: "Cycle",
        });
        try {
            const beans = notebook.add(Stock, { label: "Beans" });
            const coffee = notebook.add(Stock, { label: "Coffee" });
            const brewing = notebook.add(Flow, { label: "brewing", from: beans, to: coffee });
            const link = notebook.add(linkType, { label: "influence", from: beans, to: brewing });

            expectTypeOf<
                Parameters<typeof notebook.add<typeof linkType>>[1]["to"]
            >().toEqualTypeOf<MorphismCellData<typeof Flow> | null>();
            expectTypeOf<
                MorphismCellPatch<typeof PrimitiveSignedStockFlow, typeof linkType>["to"]
            >().toEqualTypeOf<MorphismCellData<typeof Flow> | null | undefined>();
            expect(link.to).toMatchObject({ kind: "morphism", id: brewing.id });
            const result = await notebook.validate();
            expect(result.issues).toEqual([]);
            expect(result.model.judgmentsOf(linkType)).toMatchObject([
                { from: { id: beans.generatorId }, to: { id: brewing.generatorId } },
            ]);

            notebook.update(link, { to: null });
            expect(notebook.cellsOf(linkType)).toMatchObject([{ to: null }]);
            notebook.update(link, { to: brewing });
            expect(notebook.cellsOf(linkType)).toMatchObject([{ to: { id: brewing.id } }]);
            expect((await notebook.validate()).issues).toEqual([]);

            expect(() => notebook.update(link, { to: coffee as never })).toThrow(
                `Cell ${coffee.id} is not a morphism.`,
            );
            notebook.delete(brewing);
            expect(notebook.cellsOf(linkType)).toMatchObject([{ to: null }]);
            expect(() => notebook.update(link, { to: brewing })).toThrow(
                `Cell ${brewing.id} does not exist.`,
            );
        } finally {
            notebook.dispose();
        }
    });

    test("reads notebook cells when a stored link targets itself", async () => {
        const store = createInMemoryStore();
        const notebook = await createBinder(store).createNotebook(PrimitiveSignedStockFlow, {
            title: "Self-referencing link",
        });
        try {
            const stock = notebook.add(Stock, { label: "Stock" });
            const link = notebook.add(PositiveLink, { label: "link", from: stock, to: null });
            store.changeDocument(notebook.handle, (document) => {
                const cell = document.notebook.cellContents[link.id];
                // Create a self-referencing link.
                cell.content.cod = {
                    tag: "Tabulated",
                    content: { tag: "Basic", content: link.generatorId },
                };
            });

            expect(() => notebook.cellsOf(PositiveLink)).not.toThrow();
        } finally {
            notebook.dispose();
        }
    });

    test("reports wrong morphism types and malformed stored endpoints", async () => {
        const store = createInMemoryStore();
        const notebook = await createBinder(store).createNotebook(PrimitiveSignedStockFlow, {
            title: "Cycle",
        });
        try {
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
        } finally {
            notebook.dispose();
        }
    });
});
