import * as catlog from "catlog-wasm";

import { Theory } from "../../theory";
import * as analyses from "../analyses";
import type { TheoryMeta } from "../types";

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";

export default function createOlogTheory(theoryMeta: TheoryMeta): Theory {
    const thCategory = new catlog.ThCategory();

    return new Theory({
        ...theoryMeta,
        theory: thCategory.theory(),
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Type",
                description: "Type or class of things",
                shortcut: ["O"],
                cssClasses: [styles.cornerBox],
                svgClasses: [svgStyles.box],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Aspect",
                description: "Aspect or property of a type",
                shortcut: ["M"],
            },
        ],
        instanceTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Object" },
                name: "Individual",
                description: "Individual thing of a certain type",
                shortcut: ["I"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Object" },
                },
                name: "Aspect",
                description: "Aspect or property of an individual",
                shortcut: ["M"],
            },
        ],
        modelAnalyses: [
            analyses.configureModelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the olog as a graph",
                help: "visualization",
            }),
        ],
        diagramAnalyses: [
            analyses.configureDiagramGraph({
                id: "graph",
                name: "Visualization",
                description: "Visualize the instance as a graph",
                help: "visualization",
            }),
        ],
    });
}
