import { Flow, Link, PrimitiveStockFlow, Stock } from "catcolab-logics/primitive-stock-flow";
import { describe, expect, test } from "vitest";

import { createBinder } from "catcolab-documents";

describe("primitive stock-flow influence links", { timeout: 20000 }, () => {
    test("creates a link from a stock to a flow", async () => {
        const notebook = await createBinder().createNotebook(PrimitiveStockFlow, {
            title: "Coffee brewing",
        });
        try {
            const beans = notebook.add(Stock, { label: "Beans" });
            const coffee = notebook.add(Stock, { label: "Coffee" });
            const brewing = notebook.add(Flow, { label: "brewing", from: beans, to: coffee });
            const link = notebook.add(Link, {
                label: "encourages brewing",
                from: beans,
                to: brewing,
            });

            expect(link.to).toMatchObject({ kind: "morphism", id: brewing.id });
            const result = await notebook.validate();
            expect(result.issues).toEqual([]);
            expect(result.model.judgmentsOf(Link)).toMatchObject([
                { from: { id: beans.generatorId }, to: { id: brewing.generatorId } },
            ]);
        } finally {
            notebook.dispose();
        }
    });
});
