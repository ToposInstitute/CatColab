import { lazy } from "solid-js";

import { ThCategorySignedLinks } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";

export default function createPrimitiveSignedStockFlowTheory(theoryMeta: TheoryMeta): Theory {
    const thCategorySignedLinks = new ThCategorySignedLinks();

    return new Theory({
        ...theoryMeta,
        theory: thCategorySignedLinks.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                editor: ObjectCellEditor,
                name: "Stock",
                description: "Thing with an amount",
                shortcut: ["S"],
                cssClasses: [styles.box],
                svgClasses: [svgStyles.box],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                editor: MorphismCellEditor,
                name: "Flow",
                description: "Flow from one stock to another",
                shortcut: ["F"],
                arrowStyle: "double",
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Link" },
                editor: MorphismCellEditor,
                name: "Positive link",
                description: "Positive influence of a stock on a flow",
                arrowStyle: "plus",
                preferUnnamed: true,
                shortcut: ["P"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "NegativeLink" },
                editor: MorphismCellEditor,
                name: "Negative link",
                description: "Negative influence of a stock on a flow",
                arrowStyle: "minus",
                preferUnnamed: true,
                shortcut: ["N"],
            },
        ],
        modelAnalyses: [
            analyses.stockFlowDiagram({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the stock and flow diagram",
                help: "visualization",
            }),
            analyses.massAction({
                ratesHaveGranularity: false,
                simulate(model, data) {
                    return thCategorySignedLinks.massAction(model, data);
                },
                transitionType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
            }),
            analyses.massActionEquations({
                ratesHaveGranularity: false,
                getEquations(model, data) {
                    return thCategorySignedLinks.massActionEquations(model, data);
                },
            }),
        ],
    });
}
