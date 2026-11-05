import { CausalLoop } from "catcolab-logics/causal-loop";
import { CausalLoopDelays } from "catcolab-logics/causal-loop-delays";
import { IndeterminateCausalLoop } from "catcolab-logics/indeterminate-causal-loop";
import { PowerSystem } from "catcolab-logics/power-system";
import { RegNet } from "catcolab-logics/reg-net";
import { UnaryDEC } from "catcolab-logics/unary-dec";
import { describe, expect, test } from "vitest";

import { createBinder, type Shape } from "catcolab-documents";

const shapes = [
    CausalLoop,
    CausalLoopDelays,
    IndeterminateCausalLoop,
    PowerSystem,
    RegNet,
    UnaryDEC,
];

const cases = shapes.flatMap((shape) =>
    Object.entries(shape.cellTypes)
        .filter(([, type]) => type.kind === "morphism")
        .map(([name, type]) => ({
            theory: shape.theory,
            shape: shape as Shape & { readonly theory: string },
            name,
            type,
        })),
);

describe("scalar endpoint compatibility", { timeout: 20000 }, () => {
    test.each(cases)(
        "$theory: $name creates, reads, updates, and validates",
        async ({ shape, type }) => {
            if (type.kind !== "morphism") {
                throw new Error("Expected a morphism type");
            }
            const objectType = shape.objects?.[0];
            if (!objectType) {
                throw new Error("Expected an object type");
            }
            const notebook = await createBinder().createNotebook(shape, { title: "Endpoint test" });
            try {
                const source = notebook.add(objectType, { label: "Source" });
                const target = notebook.add(objectType, { label: "Target" });
                const morphism = notebook.add(type, {
                    label: "relation",
                    from: source,
                    to: target,
                });
                expect(morphism).toMatchObject({ from: { id: source.id }, to: { id: target.id } });
                const initial = await notebook.validate();
                expect(initial.issues).toEqual([]);
                expect(initial.model.judgmentsOf(type)).toMatchObject([
                    { from: { id: source.generatorId }, to: { id: target.generatorId } },
                ]);

                notebook.update(morphism, { from: target, to: source });
                expect(notebook.cellsOf(type)).toMatchObject([
                    { id: morphism.id, from: { id: target.id }, to: { id: source.id } },
                ]);
                const updated = await notebook.validate();
                expect(updated.issues).toEqual([]);
                expect(updated.model.judgmentsOf(type)).toMatchObject([
                    { from: { id: target.generatorId }, to: { id: source.generatorId } },
                ]);
            } finally {
                notebook.dispose();
            }
        },
    );
});
