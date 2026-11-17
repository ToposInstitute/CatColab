import { lazy } from "solid-js";

import { ThSignedCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

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
                editor: ObjectCellEditor,
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
                editor: MorphismCellEditor,
                name: "Promotion",
                shortcut: ["P"],
                description: "Positive interaction: activates or promotes",
                preferUnnamed: true,
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Negative" },
                editor: MorphismCellEditor,
                name: "Inhibition",
                shortcut: ["N"],
                description: "Negative interaction: represses or inhibits",
                arrowStyle: "flat",
                preferUnnamed: true,
            },
        ],
    });
}
