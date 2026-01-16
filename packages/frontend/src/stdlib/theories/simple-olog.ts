import { ThCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";
import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";

export default function createOlogTheory(theoryMeta: TheoryMeta): Theory {
    const thCategory = new ThCategory();

    return new Theory({
        ...theoryMeta,
        theory: thCategory.theory(),
        pushforwards: [
            {
                target: "simple-schema",
                migrate: ThCategory.toSchema,
            },
        ],
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
            analyses.modelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the olog as a graph",
                help: "visualization",
            }),
        ],
        diagramAnalyses: [
            analyses.diagramGraph({
                id: "graph",
                name: "Visualization",
                description: "Visualize the instance as a graph",
                help: "visualization",
            }),
            analyses.diagramTable({
                id: "table",
                name: "Table view",
                description: "View the instance as relational tables",
            }),
        ],
    });
}
