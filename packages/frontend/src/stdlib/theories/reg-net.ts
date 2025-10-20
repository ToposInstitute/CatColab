import { ThSignedCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

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
            analyses.modelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the regulatory network",
                help: "visualization",
            }),
            analyses.motifFinding({
                id: "positive-loops",
                name: "Positive feedback",
                description: "Analyze the network for positive feedback loops",
                help: "loops",
                findMotifs(model, options) {
                    return thSignedCategory.positiveLoops(model, options);
                },
            }),
            analyses.motifFinding({
                id: "negative-loops",
                name: "Negative feedback",
                description: "Analyze the network for negative feedback loops",
                help: "loops",
                findMotifs(model, options) {
                    return thSignedCategory.negativeLoops(model, options);
                },
            }),
            analyses.linearODE({
                simulate: (model, data) => thSignedCategory.linearODE(model, data),
            }),
            analyses.lotkaVolterra({
                simulate(model, data) {
                    return thSignedCategory.lotkaVolterra(model, data);
                },
            }),
        ],
    });
}
