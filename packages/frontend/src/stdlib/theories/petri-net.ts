import { lazy } from "solid-js";

import { ThSymMonoidalCategory } from "catlog-wasm";
import { MorphismCellEditor } from "../../model/morphism_cell_editor";
import { ObjectCellEditor } from "../../model/object_cell_editor";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createPetriNetTheory(theoryMeta: TheoryMeta): Theory {
    const thSymMonoidalCategory = new ThSymMonoidalCategory();

    return new Theory({
        ...theoryMeta,
        theory: thSymMonoidalCategory.theory(),
        onlyFreeModels: true,
        editorVariants: [
            {
                id: "editor-variant-petri-net-string-diagram",
                name: "Petri net (string diagram transitions)",
                description: "Petri net with a string diagram style transition editor",
                editorOverrides: {
                    morEditors: [
                        {
                            morType: {
                                tag: "Hom" as const,
                                content: { tag: "Basic" as const, content: "Object" },
                            },
                            editor: lazy(
                                () => import("../../model/string_diagram_morphism_cell_editor"),
                            ),
                        },
                    ],
                },
            },
        ],
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
