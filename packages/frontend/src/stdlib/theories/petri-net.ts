import { lazy } from "solid-js";

import { ThSymMonoidalCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import { MorTypeMap } from "../../theory/types";
import * as analyses from "../analyses";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

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
        editorVariants: {
            defaultLabel: "List transitions",
            variants: [
                {
                    id: "editor-variant-petri-net-string-diagram",
                    label: "String diagram transitions",
                    editorOverrides: {
                        morEditors: new MorTypeMap([
                            [
                                {
                                    tag: "Hom" as const,
                                    content: { tag: "Basic" as const, content: "Object" },
                                },
                                lazy(
                                    () => import("../../model/string_diagram_morphism_cell_editor"),
                                ),
                            ],
                        ]),
                    },
                },
            ],
        },
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                editor: ObjectCellEditor,
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
                editor: MorphismCellEditor,
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
                ratesHaveGranularity: true,
                simulate(model, data) {
                    return thSymMonoidalCategory.massAction(model, data);
                },
            }),
            analyses.massActionEquations({
                ratesHaveGranularity: true,
                getEquations(model, data) {
                    return thSymMonoidalCategory.massActionEquations(model, data);
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
