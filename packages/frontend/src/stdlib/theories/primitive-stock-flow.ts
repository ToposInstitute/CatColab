import { lazy } from "solid-js";

import { ThCategoryLinks } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";

const ObjectCellEditor = lazy(() => import("../../model/object_cell_editor"));
const MorphismCellEditor = lazy(() => import("../../model/morphism_cell_editor"));

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";

export default function createPrimitiveStockFlowTheory(theoryMeta: TheoryMeta): Theory {
    const thCategoryLinks = new ThCategoryLinks();

    return new Theory({
        ...theoryMeta,
        theory: thCategoryLinks.theory(),
        inclusions: ["primitive-signed-stock-flow"],
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
                name: "Link",
                description: "Influence of a stock on a flow",
                preferUnnamed: true,
                shortcut: ["L"],
            },
        ],
    });
}
