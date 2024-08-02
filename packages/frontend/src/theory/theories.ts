import * as catlog from "catlog-wasm";

import { uniqueIndexArray } from "../util/indexing";
import { TheoryMeta } from "./types";

import styles from "./styles.module.css";
import svgStyles from "./svg_styles.module.css";

/** Standard library of double theories supported by frontend.

TODO: Should the underlying theories be lazy loaded?
 */
export const stdTheories = () =>
    uniqueIndexArray([thSimpleOlog(), thSimpleSchema(), thRegNet(), thStockFlow()], (th) => th.id);

const thSimpleOlog = () =>
    new TheoryMeta({
        id: "simple-olog",
        name: "Olog",
        description: "Ontology log, a simple conceptual model",
        theory: catlog.thCategory,
        types: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "object" },
                name: "Type",
                description: "Type or class of things",
                shortcut: ["O"],
                cssClasses: [styles["corner-box"]],
                svgClasses: [svgStyles.box],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "object" },
                },
                name: "Aspect",
                description: "Aspect or property of a thing",
                shortcut: ["M"],
            },
        ],
    });

const thSimpleSchema = () =>
    new TheoryMeta({
        id: "schema",
        name: "Schema",
        description: "Schema for a categorical database",
        theory: catlog.thSchema,
        types: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "entity" },
                name: "Entity",
                description: "Type of entity or thing",
                shortcut: ["O"],
                cssClasses: [styles.box],
                svgClasses: [svgStyles.box],
                textClasses: [styles.code],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "entity" },
                },
                name: "Mapping",
                description: "Many-to-one relation between entities",
                shortcut: ["M"],
                textClasses: [styles.code],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "attr" },
                name: "Attribute",
                description: "Data attribute of an entity",
                shortcut: ["A"],
                textClasses: [styles.code],
            },
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "attr_type" },
                name: "Attribute type",
                description: "Data type for an attribute",
                textClasses: [styles.code],
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "attr_type" },
                },
                name: "Operation",
                description: "Operation on data types for attributes",
                textClasses: [styles.code],
            },
        ],
    });

const thRegNet = () =>
    new TheoryMeta({
        id: "reg-net",
        name: "Regulatory network",
        theory: catlog.thSignedCategory,
        onlyFree: true,
        types: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "object" },
                name: "Species",
                description: "Biochemical species in the network",
            },
            {
                tag: "MorType",
                morType: {
                    tag: "Hom",
                    content: { tag: "Basic", content: "object" },
                },
                name: "Promotion",
                description: "Positive interaction: activates or promotes",
                arrowStyle: "to",
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "negative" },
                name: "Inhibition",
                description: "Negative interaction: represses or inhibits",
                arrowStyle: "flat",
            },
        ],
    });

const thStockFlow = () =>
    new TheoryMeta({
        id: "stock-flow",
        name: "Stock-flow diagram",
        theory: catlog.thCategoryLinks,
        onlyFree: true,
        types: [
            {
                tag: "ObType",
                obType: { tag: "Basic", content: "object" },
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
                    content: { tag: "Basic", content: "object" },
                },
                name: "Flow",
                description: "Flow from one stock to another",
                shortcut: ["F"],
            },
            {
                tag: "MorType",
                morType: { tag: "Basic", content: "link" },
                name: "Link",
                description: "Influence of a stock on a flow",
                shortcut: ["L"],
            },
        ],
    });
