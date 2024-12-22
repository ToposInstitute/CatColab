import * as catlog from "catlog-wasm";

import { Theory } from "../theory";
import {
    configureDecapodes,
    configureDiagramGraph,
    configureLotkaVolterra,
    configureModelGraph,
    configureStockFlowDiagram,
    configureSubmodelsAnalysis,
} from "./analyses";
import { TheoryLibrary } from "./types";

import styles from "./styles.module.css";
import svgStyles from "./svg_styles.module.css";
import textStyles from "./text_styles.module.css";

/** Standard library of double theories supported by the frontend. */
export const stdTheories = new TheoryLibrary();

stdTheories.add(
    {
        id: "simple-olog",
        name: "Olog",
        description: "Ontology log, a simple conceptual model",
        group: "Knowledge and Data",
        help: "olog",
    },
    (meta) => {
        const thCategory = new catlog.ThCategory();
        return new Theory({
            ...meta,
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
                configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the olog as a diagram",
                }),
            ],
            diagramAnalyses: [
                configureDiagramGraph({
                    id: "graph",
                    name: "Visualization",
                    description: "Visualize the instance as a graph",
                }),
            ],
        });
    },
);

stdTheories.add(
    {
        id: "simple-schema",
        name: "Schema",
        description: "Schema for a categorical database",
        group: "Knowledge and Data",
    },
    (meta) => {
        const thSchema = new catlog.ThSchema();
        return new Theory({
            ...meta,
            theory: thSchema.theory(),
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
                configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the schema as a diagram",
                }),
            ],
            diagramAnalyses: [
                configureDiagramGraph({
                    id: "graph",
                    name: "Visualization",
                    description: "Visualize the instance as a graph",
                }),
            ],
        });
    },
);

stdTheories.add(
    {
        id: "reg-net",
        name: "Regulatory network",
        description: "Biochemical species that promote or inhibit each other",
        group: "Biology",
    },
    (meta) => {
        const thSignedCategory = new catlog.ThSignedCategory();
        return new Theory({
            ...meta,
            theory: thSignedCategory.theory(),
            onlyFreeModels: true,
            modelTypes: [
                {
                    tag: "ObType",
                    obType: { tag: "Basic", content: "Object" },
                    name: "Species",
                    shortcut: ["S"],
                    description: "Biochemical species in the network",
                },
                {
                    tag: "MorType",
                    morType: {
                        tag: "Hom",
                        content: { tag: "Basic", content: "Object" },
                    },
                    name: "Promotion",
                    shortcut: ["P"],
                    description: "Positive interaction: activates or promotes",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Negative" },
                    name: "Inhibition",
                    shortcut: ["I"],
                    description: "Negative interaction: represses or inhibits",
                    arrowStyle: "flat",
                    preferUnnamed: true,
                },
            ],
            modelAnalyses: [
                configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the regulatory network",
                }),
                configureSubmodelsAnalysis({
                    id: "positive-loops",
                    name: "Positive feedback",
                    description: "Analyze the network for positive feedback loops",
                    findSubmodels: (model) => thSignedCategory.positiveLoops(model),
                }),
                configureSubmodelsAnalysis({
                    id: "negative-loops",
                    name: "Negative feedback",
                    description: "Analyze the network for negative feedback loops",
                    findSubmodels: (model) => thSignedCategory.negativeLoops(model),
                }),
                configureLotkaVolterra({
                    simulate: (model, data) => thSignedCategory.lotkaVolterra(model, data),
                }),
            ],
        });
    },
);

stdTheories.add(
    {
        id: "causal-loop",
        name: "Causal loop diagram",
        description: "Positive and negative causal relationships",
        group: "System Dynamics",
    },
    (meta) => {
        const thSignedCategory = new catlog.ThSignedCategory();

        return new Theory({
            ...meta,
            theory: thSignedCategory.theory(),
            onlyFreeModels: true,
            modelTypes: [
                {
                    tag: "ObType",
                    obType: { tag: "Basic", content: "Object" },
                    name: "Variable",
                    shortcut: ["V"],
                    description: "Variable quantity",
                },
                {
                    tag: "MorType",
                    morType: {
                        tag: "Hom",
                        content: { tag: "Basic", content: "Object" },
                    },
                    name: "Positive link",
                    shortcut: ["P"],
                    description: "Variables change in the same direction",
                    arrowStyle: "plus",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Negative" },
                    name: "Negative link",
                    shortcut: ["N"],
                    description: "Variables change in the opposite direction",
                    arrowStyle: "minus",
                    preferUnnamed: true,
                },
            ],
            modelAnalyses: [
                configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the causal loop diagram",
                }),
                configureSubmodelsAnalysis({
                    id: "negative-loops",
                    name: "Balancing loops",
                    description: "Analyze the diagram for balancing loops",
                    findSubmodels: (model) => thSignedCategory.negativeLoops(model),
                }),
                configureSubmodelsAnalysis({
                    id: "positive-loops",
                    name: "Reinforcing loops",
                    description: "Analyze the diagram for reinforcing loops",
                    findSubmodels: (model) => thSignedCategory.positiveLoops(model),
                }),
                configureLotkaVolterra({
                    simulate: (model, data) => thSignedCategory.lotkaVolterra(model, data),
                }),
            ],
        });
    },
);

stdTheories.add(
    {
        id: "indeterminate-causal-loop",
        name: "Causal loop diagram with indeterminates",
        description: "Positive, negative, and indeterminate causal relationships",
        group: "System Dynamics",
    },
    (meta) => {
        const thNullableSignedCategory = new catlog.ThNullableSignedCategory();
        return new Theory({
            ...meta,
            theory: thNullableSignedCategory.theory(),
            onlyFreeModels: true,
            modelTypes: [
                {
                    tag: "ObType",
                    obType: { tag: "Basic", content: "Object" },
                    name: "Variable",
                    shortcut: ["V"],
                    description: "Variable quantity",
                },
                {
                    tag: "MorType",
                    morType: {
                        tag: "Hom",
                        content: { tag: "Basic", content: "Object" },
                    },
                    name: "Positive link",
                    description: "Variables change in the same direction",
                    shortcut: ["P"],
                    arrowStyle: "plus",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Negative" },
                    name: "Negative link",
                    shortcut: ["N"],
                    description: "Variables change in the opposite direction",
                    arrowStyle: "minus",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Zero" },
                    name: "Indeterminate link",
                    description: "The direction that variables change is indeterminate",
                    shortcut: ["Z"],
                    arrowStyle: "indeterminate",
                    preferUnnamed: true,
                },
            ],
            modelAnalyses: [
                configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the causal loop diagram",
                }),
            ],
        });
    },
);

stdTheories.add(
    {
        id: "unary-dec",
        name: "Discrete exterior calculus (DEC)",
        description: "DEC operators on a geometrical space",
        group: "Applied Mathematics",
    },
    (meta) => {
        const thCategoryWithScalars = new catlog.ThCategoryWithScalars();

        return new Theory({
            ...meta,
            theory: thCategoryWithScalars.theory(),
            modelTypes: [
                {
                    tag: "ObType",
                    obType: { tag: "Basic", content: "Object" },
                    name: "Form type",
                    shortcut: ["F"],
                    description: "A type of differential form on the space",
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Nonscalar" },
                    name: "Operator",
                    shortcut: ["D"],
                    description: "A differential operator",
                },
                {
                    tag: "MorType",
                    morType: {
                        tag: "Hom",
                        content: { tag: "Basic", content: "Object" },
                    },
                    name: "Scalar",
                    arrowStyle: "scalar",
                    shortcut: ["S"],
                    description: "Multiplication by a scalar",
                },
            ],
            instanceOfName: "Equations in",
            instanceTypes: [
                {
                    tag: "ObType",
                    obType: { tag: "Basic", content: "Object" },
                    name: "Form",
                    description: "A form on the space",
                    shortcut: ["F"],
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Nonscalar" },
                    name: "Apply operator",
                    description: "An application of an operator to a form",
                    shortcut: ["D"],
                },
                {
                    tag: "MorType",
                    morType: {
                        tag: "Hom",
                        content: { tag: "Basic", content: "Object" },
                    },
                    name: "Scalar multiply",
                    description: "A scalar multiplication on a form",
                    shortcut: ["S"],
                },
            ],
            modelAnalyses: [
                configureModelGraph({
                    id: "graph",
                    name: "Visualization",
                    description: "Visualize the operations as a graph",
                }),
            ],
            diagramAnalyses: [
                configureDiagramGraph({
                    id: "graph",
                    name: "Visualization",
                    description: "Visualize the equations as a diagram",
                }),
                configureDecapodes({}),
            ],
        });
    },
);

stdTheories.add(
    {
        id: "primitive-stock-flow",
        name: "Stock and flow",
        description: "Model accumulation (stocks) and change (flows)",
        group: "System Dynamics",
    },
    (meta) => {
        const thCategoryLinks = new catlog.ThCategoryLinks();
        return new Theory({
            ...meta,
            theory: thCategoryLinks.theory(),
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
                    name: "Link",
                    description: "Influence of a stock on a flow",
                    preferUnnamed: true,
                    shortcut: ["L"],
                },
            ],
            modelAnalyses: [
                configureStockFlowDiagram({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the stock and flow diagram",
                }),
            ],
        });
    },
);
