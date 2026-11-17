import { lazy } from "solid-js";

import { ThSignedCategoryWithDegrees } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

export default function createCausalLoopTheory(theoryMeta: TheoryMeta): Theory {
    const thSignedCategoryWithDegrees = new ThSignedCategoryWithDegrees();

    return new Theory({
        ...theoryMeta,
        theory: thSignedCategoryWithDegrees.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                editor: ObjectCellEditor,
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
                editor: MorphismCellEditor,
                name: "Positive link",
                shortcut: ["P"],
                description: "Variables change in the same direction",
                arrowStyle: "plus",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Negative" },
                editor: MorphismCellEditor,
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
                description: "Visualize the graded causal loop diagram",
                help: "visualization",
            }),
        ],
    });
}
