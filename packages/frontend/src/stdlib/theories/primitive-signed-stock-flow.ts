import { ThCategorySignedLinks } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";
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
                name: "Positive link",
                description: "Positive influence of a stock on a flow",
                arrowStyle: "plus",
                preferUnnamed: true,
                shortcut: ["P"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "NegativeLink" },
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
                simulate(model, data) {
                    return thCategorySignedLinks.massAction(model, data);
                },
                transitionType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
            }),
            analyses.massActionEquations({
                getEquations(model) {
                    return thCategorySignedLinks.massActionEquations(model);
                },
            }),
        ],
    });
}
