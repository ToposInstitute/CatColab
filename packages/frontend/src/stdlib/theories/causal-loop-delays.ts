import { ThDelayableSignedCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createCausalLoopDelaysTheory(theoryMeta: TheoryMeta): Theory {
    const thDelayedSignedCategory = new ThDelayableSignedCategory();

    return new Theory({
        ...theoryMeta,
        theory: thDelayedSignedCategory.theory(),
        pushforwards: [
            {
                target: "causal-loop",
                migrate: ThDelayableSignedCategory.toSignedCategory,
            },
        ],
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
                description: "Fast-acting positive influence",
                arrowStyle: "plus",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Negative" },
                name: "Negative link",
                shortcut: ["N"],
                description: "Fast-acting negative influence",
                arrowStyle: "minus",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "PositiveSlow" },
                name: "Delayed positive link",
                description: "Slow-acting positive influence",
                arrowStyle: "plusCaesura",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "NegativeSlow" },
                name: "Delayed negative link",
                description: "Slow-acting negative influence",
                arrowStyle: "minusCaesura",
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
                description: "Find the fast-acting balancing loops",
                help: "loops",
                findMotifs(model, options) {
                    return thDelayedSignedCategory.negativeLoops(model, options);
                },
            }),
            analyses.motifFinding({
                id: "positive-loops",
                name: "Reinforcing loops",
                description: "Find the fast-acting reinforcing loops",
                help: "loops",
                findMotifs(model, options) {
                    return thDelayedSignedCategory.positiveLoops(model, options);
                },
            }),
            analyses.motifFinding({
                id: "delayed-negative-loops",
                name: "Delayed balancing loops",
                description: "Find the slow-acting balancing loops",
                help: "loops",
                findMotifs(model, options) {
                    return thDelayedSignedCategory.delayedNegativeLoops(model, options);
                },
            }),
            analyses.motifFinding({
                id: "delayed-positive-loops",
                name: "Delayed reinforcing loops",
                description: "Find the slow-acting reinforcing loops",
                help: "loops",
                findMotifs(model, options) {
                    return thDelayedSignedCategory.delayedPositiveLoops(model, options);
                },
            }),
        ],
    });
}
