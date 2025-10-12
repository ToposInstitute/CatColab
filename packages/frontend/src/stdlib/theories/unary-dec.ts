import { ThCategoryWithScalars } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createUnaryDECTheory(theoryMeta: TheoryMeta): Theory {
    const thCategoryWithScalars = new ThCategoryWithScalars();

    return new Theory({
        ...theoryMeta,
        theory: thCategoryWithScalars.theory(),
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
                morType: { tag: "Basic", content: "Nonscalar" },
                name: "Operator",
                shortcut: ["D"],
                description: "A differential operator",
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Scalar",
                arrowStyle: "scalar",
                shortcut: ["S"],
                description: "Multiplication by a scalar",
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
                morType: { tag: "Basic", content: "Nonscalar" },
                name: "Apply operator",
                description: "An application of an operator to a form",
                shortcut: ["D"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Scalar multiply",
                description: "A scalar multiplication on a form",
                shortcut: ["S"],
            },
        ],
        modelAnalyses: [
            analyses.modelGraph({
                id: "graph",
                name: "Visualization",
                description: "Visualize the operations as a graph",
                help: "visualization",
            }),
        ],
        diagramAnalyses: [
            analyses.diagramGraph({
                id: "graph",
                name: "Visualization",
                description: "Visualize the equations as a diagram",
            }),
            analyses.decapodes({
                id: "decapodes",
                name: "Simulation",
                description: "Simulate the PDE using Decapodes",
            }),
        ],
    });
}
