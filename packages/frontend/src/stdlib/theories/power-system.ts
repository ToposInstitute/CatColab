import { ThPowerSystem } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createPowerSystemsTheory(theoryMeta: TheoryMeta): Theory {
    const thPowerSystem = new ThPowerSystem();

    return new Theory({
        ...theoryMeta,
        theory: thPowerSystem.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Bus" },
                name: "Bus",
                description: "Node in the power system",
                shortcut: ["B"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Bus" },
                },
                name: "Line",
                description: "Passive line between buses",
                arrowStyle: "unmarked",
                preferUnnamed: true,
                shortcut: ["L"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Passive" },
                name: "Transformer",
                description: "Passive line allowing a change of voltage",
                arrowStyle: "unmarked",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Branch" },
                name: "Link",
                description: "Controllable flow between buses",
                arrowStyle: "unmarked",
                preferUnnamed: true,
            },
        ],
        modelAnalyses: [
            analyses.modelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the power system as a network",
                help: "visualization",
            }),
            analyses.kuramoto({
                simulate: (model, data) => thPowerSystem.kuramoto(model, data),
                parameterLabels: {
                    coupling: "Capacity",
                    forcing: "Input power",
                },
            }),
        ],
    });
}
