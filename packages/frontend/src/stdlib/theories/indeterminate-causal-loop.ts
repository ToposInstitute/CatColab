import { lazy } from "solid-js";

import { ThNullableSignedCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

export default function createIndeterminateCausalLoopTheory(theoryMeta: TheoryMeta): Theory {
    const thNullableSignedCategory = new ThNullableSignedCategory();

    return new Theory({
        ...theoryMeta,
        theory: thNullableSignedCategory.theory(),
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
                description: "Variables change in the same direction",
                shortcut: ["P"],
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
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Zero" },
                editor: MorphismCellEditor,
                name: "Indeterminate link",
                description: "The direction that variables change is indeterminate",
                shortcut: ["Z"],
                arrowStyle: "indeterminate",
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
        ],
    });
}
