import { ThSchemaMaybe } from "catlog-wasm";
import { type DiagramAnalysisMeta, Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

import styles from "../styles.module.css";
import svgStyles from "../svg_styles.module.css";
import textStyles from "../text_styles.module.css";

export default function createSchemaMaybeTheory(theoryMeta: TheoryMeta): Theory {
    const thSchemaMaybe = new ThSchemaMaybe();
    const diagramAnalyses: DiagramAnalysisMeta[] = [
        analyses.diagramGraph({
            id: "graph",
            name: "Visualization",
            description: "Visualize the instance as a graph",
            help: "visualization",
        }),
        analyses.tabularView({
            id: "tabularview",
            name: "Table view",
            description: "Visualize the instance as a table",
            help: "tabularview",
        }),
    ];
    return new Theory({
        ...theoryMeta,
        theory: thSchemaMaybe.theory(),
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
                morType: { tag: "Basic", content: "Rel" },
                name: "Relation",
                description: "Many-to-one relation between entities",
                shortcut: ["R"],
                textClasses: [textStyles.code],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "MaybeRel" },
                name: "Nullable relation",
                description: "Optional many-to-one relation between entities",
                shortcut: ["N"],
                arrowStyle: "dashed",
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
                tag: "MorType",
                morType: { tag: "Basic", content: "MaybeAttr" },
                name: "Nullable attribute",
                description: "Optional data attribute of an entity",
                shortcut: ["M"],
                arrowStyle: "dashed",
                textClasses: [textStyles.code],
            },
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "AttrType" },
                name: "Attribute type",
                description: "Data type for an attribute",
                textClasses: [textStyles.code],
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
                types: {
                    entityType: { tag: "Basic", content: "Entity" },
                    attrTypes: [{ tag: "Basic", content: "Attr" }],
                    nullableAttrTypes: [{ tag: "Basic", content: "MaybeAttr" }],
                    relationTypes: [{ tag: "Basic", content: "Rel" }],
                    nullableRelationTypes: [{ tag: "Basic", content: "MaybeRel" }],
                },
            }),
            analyses.renderSQL({
                id: "sql",
                render: (model, data) => thSchemaMaybe.renderSQL(model, data),
            }),
        ],
        diagramAnalyses: diagramAnalyses,
    });
}
