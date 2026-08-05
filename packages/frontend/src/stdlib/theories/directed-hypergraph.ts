import { lazy } from "solid-js";

import { ThSymMonoidalCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

export default function createDirectedHypergraphTheory(theoryMeta: TheoryMeta): Theory {
    const thSymMonoidalCategory = new ThSymMonoidalCategory();

    return new Theory({
        ...theoryMeta,
        theory: thSymMonoidalCategory.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                editor: ObjectCellEditor,
                name: "Vertex",
                description: "Vertex of the hypergraph",
                shortcut: ["V"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                editor: MorphismCellEditor,
                name: "Hyperedge",
                description: "Directed hyperedge relating input vertices to output vertices",
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
            analyses.hypergraphVisualization({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the directed hypergraph",
                help: "visualization",
            }),
        ],
    });
}
