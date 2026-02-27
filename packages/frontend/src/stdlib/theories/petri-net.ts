import { ThSymMonoidalCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createPetriNetTheory(theoryMeta: TheoryMeta): Theory {
    const thSymMonoidalCategory = new ThSymMonoidalCategory();

    // const _diagramAnalyses: DiagramAnalysisMeta[] = [
    //     analyses.diagramGraph({
    //         id: "graph",
    //         name: "Visualization",
    //         description: "Visualize the instance as a graph",
    //         help: "visualization",
    //     }),
    // ];

    // if (import.meta.env.DEV) {
    //     diagramAnalyses.push(
    //         analyses.tabularView({
    //             id: "tabularview",
    //             name: "Tabular Visualization",
    //             description: "Visualize the instance as a table",
    //             help: "tabularview",
    //         }),
    //     );
    // }

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
            analyses.petriNetVisualization({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the Petri net",
                help: "visualization",
            }),
            analyses.massAction({
                simulate(model, data) {
                    return thSymMonoidalCategory.massAction(model, data);
                },
            }),
            analyses.massActionEquations({
                getEquations(model) {
                    return thSymMonoidalCategory.massActionEquations(model);
                },
            }),
            analyses.unbalancedMassActionEquations({
                getEquations(model) {
                    return thSymMonoidalCategory.unbalancedMassActionEquations(model);
                },
            }),
            analyses.stochasticMassAction({
                id: "stochastic-mass-action",
                name: "Stochastic mass-action dynamics",
                description: "Simulate a stochastic system using the law of mass action",
                help: "stochastic-mass-action",
                simulate(model, data) {
                    return thSymMonoidalCategory.stochasticMassAction(model, data);
                },
            }),
            analyses.reachability({
                check(model, data) {
                    return thSymMonoidalCategory.subreachability(model, data);
                },
            }),
        ],
    });
}
