import { ThSchema } from "catlog-wasm";
import { type DiagramAnalysisMeta, Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";
import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";
import textStyles from "../text_styles.module.css";

export default function createSchemaTheory(theoryMeta: TheoryMeta): Theory {
    const thSchema = new ThSchema();
    let diagramAnalyses: DiagramAnalysisMeta[] = [
        analyses.diagramGraph({
            id: "graph",
            name: "Visualization",
            description: "Visualize the instance as a graph",
            help: "visualization",
        }),
    ];

    if (import.meta.env.DEV) {
        diagramAnalyses.push(
            analyses.tabularView({
                id: "tabularview",
                name: "Tabular Visualization",
                description: "Visualize the instance as a table",
                help: "tabularview",
            }),
        );
    }
    return new Theory({
        ...theoryMeta,
        theory: thSchema.theory(),
        pushforwards: [
            {
                target: "simple-olog",
                migrate: ThSchema.toCategory,
            },
        ],
        modelTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Entity" },
                name: "Entity",
                description: "Type of entity or thing",
                shortcut: ["O"],
                cssClasses: [styles.box],
                svgClasses: [svgStyles.box],
                textClasses: [textStyles.code],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Entity" },
                },
                name: "Mapping",
                description: "Many-to-one relation between entities",
                shortcut: ["M"],
                textClasses: [textStyles.code],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Attr" },
                name: "Attribute",
                description: "Data attribute of an entity",
                shortcut: ["A"],
                textClasses: [textStyles.code],
            },
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "AttrType" },
                name: "Attribute type",
                description: "Data type for an attribute",
                textClasses: [textStyles.code],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "AttrType" },
                },
                name: "Operation",
                description: "Operation on data types for attributes",
                textClasses: [textStyles.code],
            },
        ],
        instanceTypes: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "Entity" },
                name: "Individual",
                description: "Individual entity of a certain type",
                shortcut: ["I"],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "Entity" },
                },
                name: "Maps to",
                description: "One individual mapped to another",
                shortcut: ["M"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "Attr" },
                name: "Attribute",
                description: "Data attribute of an individual",
                shortcut: ["A"],
            },
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "AttrType" },
                name: "Attribute variable",
                description: "Variable that can be bound to attribute values",
            },
        ],
        modelAnalyses: [
            analyses.modelGraph({
                id: "diagram",
                name: "Visualization",
                description: "Visualize the schema as a graph",
                help: "visualization",
            }),
            analyses.schemaERD({
                id: "erd",
                name: "Entity-relationship diagram",
                description: "Visualize the schema as an entity-relationship diagram",
                help: "schema-erd",
            }),
            analyses.renderSQL({
                id: "sql",
                render: (model, data) => thSchema.renderSQL(model, data),
            }),
        ],
        diagramAnalyses: diagramAnalyses,
    });
}
