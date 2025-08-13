import { ThSignedCategory } from "catlog-wasm";

import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

export default function createRegulatoryNetworkTheory(theoryMeta: TheoryMeta): Theory {
    const thSignedCategory = new ThSignedCategory();

    return new Theory({
        ...theoryMeta,
        theory: thSignedCategory.theory(),
        inclusions: ["causal-loop", "causal-loop-delays", "indeterminate-causal-loop"],
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Species",
                shortcut: ["S"],
                description: "Biochemical species in the network",
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Promotion",
                shortcut: ["P"],
                description: "Positive interaction: activates or promotes",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Negative" },
                name: "Inhibition",
                shortcut: ["I"],
                description: "Negative interaction: represses or inhibits",
                arrowStyle: "flat",
                preferUnnamed: true,
            },
        ],
        modelAnalyses: [
            analyses.configureModelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the regulatory network",
                help: "visualization",
            }),
            analyses.configureSubmodelsAnalysis({
                id: "positive-loops",
                name: "Positive feedback",
                description: "Analyze the network for positive feedback loops",
                help: "loops",
                findSubmodels(model, options) {
                    return thSignedCategory.positiveLoops(model, options);
                },
            }),
            analyses.configureSubmodelsAnalysis({
                id: "negative-loops",
                name: "Negative feedback",
                description: "Analyze the network for negative feedback loops",
                help: "loops",
                findSubmodels(model, options) {
                    return thSignedCategory.negativeLoops(model, options);
                },
            }),
            analyses.configureLinearODE({
                simulate: (model, data) => thSignedCategory.linearODE(model, data),
            }),
            analyses.configureLotkaVolterra({
                simulate(model, data) {
                    return thSignedCategory.lotkaVolterra(model, data);
                },
            }),
        ],
    });
}
