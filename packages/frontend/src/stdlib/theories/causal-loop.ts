import { ThSignedCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createCausalLoopTheory(theoryMeta: TheoryMeta): Theory {
    const thSignedCategory = new ThSignedCategory();

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
            analyses.modelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the causal loop diagram",
                help: "visualization",
            }),
            analyses.motifFinding({
                id: "negative-loops",
                name: "Balancing loops",
                description: "Analyze the diagram for balancing loops",
                help: "loops",
                findMotifs(model, options) {
                    return thSignedCategory.negativeLoops(model, options);
                },
            }),
            analyses.motifFinding({
                id: "positive-loops",
                name: "Reinforcing loops",
                description: "Analyze the diagram for reinforcing loops",
                help: "loops",
                findMotifs(model, options) {
                    return thSignedCategory.positiveLoops(model, options);
                },
            }),
            analyses.linearODE({
                simulate: (model, data) => thSignedCategory.linearODE(model, data),
            }),
            analyses.lotkaVolterra({
                simulate: (model, data) => thSignedCategory.lotkaVolterra(model, data),
            }),
        ],
    });
}
