import { ThModalStateAuxCategory } from "catlog-wasm";

import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";

export default function createStockFlowAuxTheory(theoryMeta: TheoryMeta): Theory {
    const thCategoryStockFlowAux = new ThModalStateAuxCategory();

    return new Theory({
        ...theoryMeta,
        theory: thCategoryStockFlowAux.theory(),
        onlyFreeModels: true,
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "State" },
                name: "Stock",
                description: "Thing with an amount",
                shortcut: ["S"],
                cssClasses: [styles.box],
                svgClasses: [svgStyles.box],
            },
            {
                tag: "MorType",
				morType: { tag: "Basic", content: "out-neg" },
                name: "Outflow",
                description: "Flow from one stock to another",
                shortcut: ["+"],
                arrowStyle: "double",
            },
			{
                tag: "MorType",
				morType: { tag: "Basic", content: "out-pos" },
                name: "Inflow",
                description: "Flow from one stock to another",
                shortcut: ["-"],
                arrowStyle: "double",
            },
			{
                tag: "ObType",
                obType: { tag: "Basic", content: "Auxiliary" },
                name: "Auxiliary",
                description: "Variable used in computation",
                shortcut: ["A"],
                cssClasses: [styles.box],
                svgClasses: [svgStyles.box],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Borrow" },
                name: "Borrow",
                description: "Influence of a stock on a flow",
                preferUnnamed: true,
                shortcut: ["&"],
            },
        ],
        modelAnalyses: [
            analyses.configureStockFlowDiagram({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the stock and flow diagram",
                help: "visualization",
            }),
            analyses.configureSwitchingMassAction({
                simulate(model, data) {
                    return thCategoryStockFlowAux.massAction(model, data);
                },
                isTransition(mor) {
                    return mor.morType.tag === "Hom";
                },
            }),
        ],
    });
}
