import * as catlog from "catlog-wasm";

import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

export default function createPetriNetTheory(theoryMeta: TheoryMeta): Theory {
    const thSymMonoidalCategory = new catlog.ThSymMonoidalCategory();

    return new Theory({
        ...theoryMeta,
        theory: thSymMonoidalCategory.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Place",
                description: "State of the system",
                shortcut: ["O"],
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
        modelAnalyses: [
            analyses.configurePetriNetVisualization({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the Petri net",
            }),
            analyses.configureMassAction({
                simulate(model, data) {
                    return thSymMonoidalCategory.massAction(model, data);
                },
            }),
        ],
    });
}
