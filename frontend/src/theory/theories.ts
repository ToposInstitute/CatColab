import * as catlog from "catlog-wasm";

import { uniqueIndexArray } from "../util/indexing";
import { createTheoryMeta } from "./types";

import styles from "./styles.module.css";
import svgStyles from "./svg_styles.module.css";


/** Standard library of double theories supported by frontend.

TODO: Should the underlying theories be lazy loaded?
 */
export const stdTheories = () => uniqueIndexArray([
    thSimpleOlog(),
    thSimpleSchema(),
    thRegNet(),
], th => th.id);


const thSimpleOlog = () => createTheoryMeta({
    id: "simple-olog",
    name: "Olog",
    description: "Ontology log, a simple conceptual model",
    theory: catlog.thCategory,
    types: [
        {
            tag: "ob_type",
            obType: "object",
            name: "Type",
            description: "Type or class of things",
            shortcut: ["O"],
            cssClasses: [styles["corner-box"]],
            svgClasses: [svgStyles.box],
        },
        {
            tag: "mor_type",
            morType: {tag: "Id", content: "object"},
            name: "Aspect",
            description: "Aspect or property of a thing",
            shortcut: ["M"],
        }
    ],
});

const thSimpleSchema = () => createTheoryMeta({
    id: "schema",
    name: "Schema",
    description: "Schema for a categorical database",
    theory: catlog.thSchema,
    types: [
        {
            tag: "ob_type",
            obType: "entity",
            name: "Entity",
            description: "Type of entity or thing",
            shortcut: ["O"],
            cssClasses: [styles.box],
            svgClasses: [svgStyles.box],
            textClasses: [styles.code],
        },
        {
            tag: "mor_type",
            morType: {tag: "Id", content: "entity"},
            name: "Mapping",
            description: "Many-to-one relation between entities",
            shortcut: ["M"],
            textClasses: [styles.code],
        },
        {
            tag: "mor_type",
            morType: {tag: "Generator", content: "attr"},
            name: "Attribute",
            description: "Data attribute of an entity",
            shortcut: ["A"],
            textClasses: [styles.code],
        },
        {
            tag: "ob_type",
            obType: "attr_type",
            name: "Attribute type",
            description: "Data type for an attribute",
            textClasses: [styles.code],
        },
        {
            tag: "mor_type",
            morType: {tag: "Id", content: "attr_type"},
            name: "Operation",
            description: "Operation on data types for attributes",
            textClasses: [styles.code],
        }
    ],
});

const thRegNet = () => createTheoryMeta({
    id: "reg-net",
    name: "Regulatory network",
    theory: catlog.thSignedCategory,
    onlyFree: true,
    types: [
        {
            tag: "ob_type",
            obType: "object",
            name: "Species",
            description: "Biochemical species in the network",
        },
        {
            tag: "mor_type",
            morType: {tag: "Id", content: "object"},
            name: "Promotion",
            description: "Positive interaction: activates or promotes",
            arrowStyle: "to",
        },
        {
            tag: "mor_type",
            morType: {tag: "Generator", content: "negative"},
            name: "Inhibition",
            description: "Negative interaction: represses or inhibits",
            arrowStyle: "flat",
        }
    ],
});
