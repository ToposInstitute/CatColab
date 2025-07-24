import * as catlog from "catlog-wasm";

import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

export default function createCausalLoopTheory(theoryMeta: TheoryMeta): Theory {
    const thSignedCategory = new catlog.ThSignedCategory();

    return new Theory({
        ...theoryMeta,
        theory: thSignedCategory.theory(),
        inclusions: ["reg-net", "causal-loop-delays", "indeterminate-causal-loop"],
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Variable",
                shortcut: ["V"],
                description: "Variable quantity",
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Positive link",
                shortcut: ["P"],
                description: "Variables change in the same direction",
                arrowStyle: "plus",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Negative" },
                name: "Negative link",
                shortcut: ["N"],
                description: "Variables change in the opposite direction",
                arrowStyle: "minus",
                preferUnnamed: true,
            },
        ],
        modelAnalyses: [
            analyses.configureModelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the causal loop diagram",
                help: "visualization",
            }),
            analyses.configureSubmodelsAnalysis({
                id: "negative-loops",
                name: "Balancing loops",
                description: "Analyze the diagram for balancing loops",
                help: "loops",
                findSubmodels(model, options) {
                    return thSignedCategory.negativeLoops(model, options);
                },
            }),
            analyses.configureSubmodelsAnalysis({
                id: "positive-loops",
                name: "Reinforcing loops",
                description: "Analyze the diagram for reinforcing loops",
                help: "loops",
                findSubmodels(model, options) {
                    return thSignedCategory.positiveLoops(model, options);
                },
            }),
            analyses.configureLinearODE({
                simulate: (model, data) => thSignedCategory.linearODE(model, data),
            }),
            analyses.configureLotkaVolterra({
                simulate: (model, data) => thSignedCategory.lotkaVolterra(model, data),
            }),
        ],
    });
}
