import { ThSymMonoidalCategory } from "catlog-wasm";

import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

export default function createUnaryDECTheory(theoryMeta: TheoryMeta): Theory {
    const thSymMonoidalCategory = new ThSymMonoidalCategory();

    return new Theory({
        ...theoryMeta,
        theory: thSymMonoidalCategory.theory(),
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Form type",
                shortcut: ["F"],
                description: "A type of differential form on the space",
            },
			{
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Transition",
                description: "Event causing change of state",
                shortcut: ["M"],
                domain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
                codomain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
            },
        ],
        instanceOfName: "Equations in",
        instanceTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Form",
                description: "A form on the space",
                shortcut: ["F"],
            },
            {
                tag: "MorType",
                morType: {
					tag: "Hom",
					content: { tag: "Basic", content: "Object" },
				},
                name: "Apply operator",
                description: "An application of an operator to a form",
                shortcut: ["D"],
				domain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
                codomain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
            },
        ],
        modelAnalyses: [
            analyses.configurePetriNetVisualization({
                id: "graph",
                name: "Visualization",
                description: "Visualize the [...]",
            }),
        ],
        diagramAnalyses: [
            analyses.configureDiagramGraph({
                id: "graph",
                name: "Visualization",
                description: "Visualize the equations as a diagram",
            }),
            analyses.configureDecapodes({}),
        ],
    });
}
