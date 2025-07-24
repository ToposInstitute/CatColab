import { ThCategoryLinks } from "catlog-wasm";

import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";

export default function createPrimitiveStockFlowTheory(theoryMeta: TheoryMeta): Theory {
    const thCategoryLinks = new ThCategoryLinks();

    return new Theory({
        ...theoryMeta,
        theory: thCategoryLinks.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
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
                name: "Flow",
                description: "Flow from one stock to another",
                shortcut: ["F"],
                arrowStyle: "double",
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Link" },
                name: "Link",
                description: "Influence of a stock on a flow",
                preferUnnamed: true,
                shortcut: ["L"],
            },
        ],
        modelAnalyses: [
            analyses.configureStockFlowDiagram({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the stock and flow diagram",
                help: "visualization",
            }),
            analyses.configureMassAction({
                simulate(model, data) {
                    return thCategoryLinks.massAction(model, data);
                },
                isTransition(mor) {
                    return mor.morType.tag === "Hom";
                },
            }),
        ],
    });
}
