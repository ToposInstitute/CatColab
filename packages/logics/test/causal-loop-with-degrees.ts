import { createBinder } from "catcolab-documents";
import { GradedCausalLoop, Variable, PositiveLinkWithDegree, NegativeLinkWithDegree } from "catcolab-logics/causal-loop-with-degrees";

import { describe, expect, test } from "vitest";

// describe("primitive stock-flow influence links", { timeout: 20000 }, () => {
//     test("creates a link from a stock to a flow", async () => {
//         const notebook = await createBinder().createNotebook(PrimitiveStockFlow, {
//             title: "Coffee brewing",
//         });
//         try {
//             const beans = notebook.add(Stock, { label: "Beans" });
//             const coffee = notebook.add(Stock, { label: "Coffee" });
//             const brewing = notebook.add(Flow, { label: "brewing", from: beans, to: coffee });
//             const link = notebook.add(Link, {
//                 label: "encourages brewing",
//                 from: beans,
//                 to: brewing,
//             });

//             expect(link.to).toMatchObject({ kind: "morphism", id: brewing.id });
//             const result = await notebook.validate();
//             expect(result.issues).toEqual([]);
//             expect(result.model.judgmentsOf(Link)).toMatchObject([
//                 { from: { id: beans.generatorId }, to: { id: brewing.generatorId } },
//             ]);
//         } finally {
//             notebook.dispose();
//         }
//     });
// });


describe("causal loop diagram with degrees", { timeout: 20_000 }, () => {
    test("links with strictly positive degrees", async () => {
        const notebook = await createBinder().createNotebook(GradedCausalLoop, {
            title: "Foxes and hares and grass",
        });
        try {
            const foxes = notebook.add(Variable, { label: "Foxes" });
            const hares = notebook.add(Variable, { label: "Hares" });
            const grass = notebook.add(Variable, { label: "Grass" });
            const carnivority = notebook.add(PositiveLinkWithDegree,
                {
                    label: "foxes eat hares",
                    from: hares,
                    to: foxes,
                    values: { repeatLength: 2 }
                }
            );
            const beingEaten = notebook.add(NegativeLinkWithDegree,
                {
                    label: "hares are eaten by foxes",
                    from: foxes,
                    to: hares,
                    values: { repeatLength: 1 }
                }
            );
        } finally {
            notebook.dispose();
        }
    });
});
