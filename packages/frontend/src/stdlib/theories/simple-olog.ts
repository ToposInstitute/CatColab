import { ThCategory } from "catlog-wasm";
import type { InstanceTypeMeta, ModelMorTypeMeta, ModelTypeMeta } from "../../theory";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";

/** Object type metadata shared by olog and its editor variants. */
export const ologObTypeMeta: ModelTypeMeta = {
    tag: "ObType",
    obType: { tag: "Basic", content: "Object" },
    name: "Type",
    description: "Type or class of things",
    shortcut: ["O"],
    cssClasses: [styles.cornerBox],
    svgClasses: [svgStyles.box],
};

/** Morphism type metadata shared by olog and its editor variants. */
export const ologMorTypeMeta: { tag: "MorType" } & ModelMorTypeMeta = {
    tag: "MorType",
    morType: {
        tag: "Hom",
        content: { tag: "Basic", content: "Object" },
    },
    name: "Aspect",
    description: "Aspect or property of a type",
    shortcut: ["M"],
};

/** Instance types shared by olog and its editor variants. */
export const ologInstanceTypes: InstanceTypeMeta[] = [
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
];

/** Model analyses shared by olog and its editor variants. */
export function ologModelAnalyses() {
    return [
        analyses.modelGraph({
            id: "diagram",
            name: "Visualization",
            description: "Visualize the olog as a graph",
            help: "visualization",
        }),
    ];
}

/** Diagram analyses shared by olog and its editor variants. */
export function ologDiagramAnalyses() {
    return [
        analyses.diagramGraph({
            id: "graph",
            name: "Visualization",
            description: "Visualize the instance as a graph",
            help: "visualization",
        }),
    ];
}

export default function createOlogTheory(theoryMeta: TheoryMeta): Theory {
    const thCategory = new ThCategory();

    return new Theory({
        ...theoryMeta,
        theory: thCategory.theory(),
        inclusions: ["simple-olog-reversed"],
        pushforwards: [
            {
                target: "simple-schema",
                migrate: ThCategory.toSchema,
            },
        ],
        modelTypes: [ologObTypeMeta, ologMorTypeMeta],
        instanceTypes: ologInstanceTypes,
        modelAnalyses: ologModelAnalyses(),
        diagramAnalyses: ologDiagramAnalyses(),
    });
}
