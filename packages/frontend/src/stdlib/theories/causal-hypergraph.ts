import { lazy } from "solid-js";

import { ThCausalHypergraph } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

import svgStyles from "../svg_styles.module.css";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

/** The tabulator object type `Tab(Causal)`: a causal edge viewed as an object. */
const tabCausal = {
    tag: "Tabulator",
    content: { tag: "Basic", content: "Causal" },
} as const;

export default function createCausalHypergraphTheory(theoryMeta: TheoryMeta): Theory {
    const thCausalHypergraph = new ThCausalHypergraph();

    return new Theory({
        ...theoryMeta,
        theory: thCausalHypergraph.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Action" },
                editor: ObjectCellEditor,
                name: "Action",
                description: "Action vertex of the causal digraph",
                shortcut: ["A"],
                svgClasses: [svgStyles.box],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Causal" },
                editor: MorphismCellEditor,
                name: "Causal edge",
                description: "Causal edge between actions; a vertex of the extracted hypergraph",
                shortcut: ["C"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Grading" },
                editor: MorphismCellEditor,
                name: "Grading",
                description: "Grading / temporal-order edge between actions",
                shortcut: ["G"],
            },
            {
                tag: "MorType",
                morType: { tag: "Hom", content: tabCausal },
                editor: MorphismCellEditor,
                name: "Hyperedge",
                description:
                    "Directed hyperedge relating input causal edges to output causal edges",
                shortcut: ["H"],
                domain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
                codomain: {
                    apply: { tag: "Basic", content: "tensor" },
                },
            },
        ],
        modelAnalyses: [
            analyses.causalDigraphVisualization({
                id: "digraph",
                name: "Causal digraph",
                description: "Visualize the actions, causal edges, and grading",
                help: "visualization",
            }),
            analyses.hypergraphVisualization({
                id: "hypergraph",
                name: "Extracted hypergraph",
                description: "Visualize the hypergraph whose vertices are the causal edges",
                help: "visualization",
                vertexMorType: { tag: "Basic", content: "Causal" },
                hyperedgeMorType: { tag: "Hom", content: tabCausal },
            }),
        ],
    });
}
