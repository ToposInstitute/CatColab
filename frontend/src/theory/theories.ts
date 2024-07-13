import * as catlog from "catlog-wasm";

import { isoTheoryId, TheoryMeta } from "./types";


/** Standard library of double theories supported by frontend.

TODO: Should the underlying theories be lazy loaded?
 */
export const stdTheories = (): TheoryMeta[] => [
    {
        id: isoTheoryId.wrap("simple-olog"),
        name: "Olog",
        description: "Ontology log, a simple conceptual model",
        theory: catlog.thSimpleOlog(),
        types: [
            {
                tag: "ob_type",
                id: "type",
                name: "Type",
                description: "Type or class of things",
                shortcut: ["O"],
            },
            {
                tag: "mor_type",
                id: "aspect",
                name: "Aspect",
                description: "Aspect or property of a thing",
                shortcut: ["M"],
            }
        ],
    },
    {
        id: isoTheoryId.wrap("simple-schema"),
        name: "Schema",
        description: "Schema for a categorical database",
        theory: catlog.thSimpleSchema(),
        types: [
            {
                tag: "ob_type",
                id: "entity",
                name: "Entity",
                description: "Type of entity or thing",
                shortcut: ["O"],
            },
            {
                tag: "mor_type",
                id: "map",
                name: "Mapping",
                description: "Many-to-one relation between entities",
                shortcut: ["M"],
            },
            {
                tag: "mor_type",
                id: "attr",
                name: "Attribute",
                description: "Data attribute of an entity",
                shortcut: ["A"],
            },
            {
                tag: "ob_type",
                id: "attr_type",
                name: "Attribute type",
                description: "Data type for an attribute",
            },
            {
                tag: "mor_type",
                id: "attr_op",
                name: "Operation",
                description: "Operation on data types for attributes",
            }
        ]
    },
    {
        id: isoTheoryId.wrap("reg-net"),
        name: "Regulatory network",
        theory: catlog.thSignedCategory(),
        free: true,
        types: [
            {
                tag: "ob_type",
                id: "object",
                name: "Species",
                description: "Biochemical species in the network",
            },
            {
                tag: "mor_type",
                id: "positive",
                name: "Promotion",
                description: "Positive interaction: activates or promotes",
            },
            {
                tag: "mor_type",
                id: "negative",
                name: "Inhibition",
                description: "Negative interaction: inhibits",
            }
        ]
    }
];
