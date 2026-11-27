import { createBinder } from "catcolab-documents";
import { GradedCausalLoop, Variable, PositiveLinkWithDegree, NegativeLinkWithDegree } from "catcolab-logics/causal-loop-with-degrees";

import { describe, expect, test } from "vitest";

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
                    repeatLength: 2,
                }
            );
            const beingEaten = notebook.add(NegativeLinkWithDegree,
                {
                    label: "hares are eaten by foxes",
                    from: foxes,
                    to: hares,
                    repeatLength: 1,
                }
            );

            const result = await notebook.validate();
            expect(result.issues).toEqual([]);
        } finally {
            notebook.dispose();
        }
    });
});
