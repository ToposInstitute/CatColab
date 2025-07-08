import * as catlog from "catlog-wasm";

import { Theory } from "../theory";
import * as analyses from "./analyses";
import { TheoryLibrary } from "./types";

import styles from "./styles.module.css";
import svgStyles from "./svg_styles.module.css";
import textStyles from "./text_styles.module.css";

/** Standard library of double theories supported by the frontend. */
export const stdTheories = new TheoryLibrary();

stdTheories.add(
    {
        id: "empty",
        name: "Informal",
        description: "The empty logic, allowing only informal content",
        isDefault: true,
        group: "Base",
        help: "empty",
    },
    (meta) => {
        const thEmpty = new catlog.ThEmpty();
        return new Theory({
            ...meta,
            theory: thEmpty.theory(),
        });
    },
);

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
                analyses.configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the olog as a graph",
                }),
            ],
            diagramAnalyses: [
                analyses.configureDiagramGraph({
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
        help: "schema",
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
                analyses.configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the schema as a graph",
                }),
            ],
            diagramAnalyses: [
                analyses.configureDiagramGraph({
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
        help: "reg-net",
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
                analyses.configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the regulatory network",
                }),
                analyses.configureSubmodelsAnalysis({
                    id: "positive-loops",
                    name: "Positive feedback",
                    description: "Analyze the network for positive feedback loops",
                    findSubmodels(model, options) {
                        return thSignedCategory.positiveLoops(model, options);
                    },
                }),
                analyses.configureSubmodelsAnalysis({
                    id: "negative-loops",
                    name: "Negative feedback",
                    description: "Analyze the network for negative feedback loops",
                    findSubmodels(model, options) {
                        return thSignedCategory.negativeLoops(model, options);
                    },
                }),
                analyses.configureLotkaVolterra({
                    simulate(model, data) {
                        return thSignedCategory.lotkaVolterra(model, data);
                    },
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
        help: "causal-loop",
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
                analyses.configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the causal loop diagram",
                }),
                analyses.configureSubmodelsAnalysis({
                    id: "negative-loops",
                    name: "Balancing loops",
                    description: "Analyze the diagram for balancing loops",
                    findSubmodels(model, options) {
                        return thSignedCategory.negativeLoops(model, options);
                    },
                }),
                analyses.configureSubmodelsAnalysis({
                    id: "positive-loops",
                    name: "Reinforcing loops",
                    description: "Analyze the diagram for reinforcing loops",
                    findSubmodels(model, options) {
                        return thSignedCategory.positiveLoops(model, options);
                    },
                }),
                analyses.configureCCLFO({
                    simulate: (model, data) => thSignedCategory.cclfo(model, data),
                }),
                analyses.configureLotkaVolterra({
                    simulate: (model, data) => thSignedCategory.lotkaVolterra(model, data),
                }),
            ],
        });
    },
);

stdTheories.add(
    {
        id: "e-causal-loops",
        name: "Extended causal loop diagram",
        description: "Causal relationships: positive or negative, with differential degree and delay",
        group: "System Dynamics",
        help: "e-causal-loops",
    },
    (meta) => {
        const thNN2Category = new catlog.ThNN2Category();

        return new Theory({
            ...meta,
            theory: thNN2Category.theory(),
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
                    name: "Positive degree 0",
                    shortcut: ["P"],
                    description: "Positive influence",
                    arrowStyle: "plus",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Negative" },
                    name: "Negative degree 0",
                    shortcut: ["N"],
                    description: "Negative influence",
                    arrowStyle: "minus",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Degree" },
                    name: "Positive degree 1",
                    description: "Positive influence on the derivative",
                    arrowStyle: "plusDeg",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Composite", content:
                               [
                                   { tag: "Basic", content: "Negative"},
                                   { tag: "Basic", content: "Degree"},
                               ] },
                    name: "Negative degree 1",
                    description: "Negative influence on the derivative",
                    arrowStyle: "minusDeg",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Composite", content:
                               [
                                   { tag: "Basic", content: "Degree"},
                                   { tag: "Basic", content: "Degree"},
                               ] },
                    name: "Positive degree 2",
                    description: "Positive influence on the SECOND derivative 📈",
                    arrowStyle: "plusDeg",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Composite", content:
                               [
                                   { tag: "Basic", content: "Negative"},
                                   { tag: "Basic", content: "Degree"},
                                   { tag: "Basic", content: "Degree"},
                               ] },
                    name: "Negative degree 2",
                    description: "Negative influence on the SECOND derivative 📉",
                    arrowStyle: "minusDeg",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Composite", content:
                               [
                                   { tag: "Basic", content: "Degree"},
                                   { tag: "Basic", content: "Degree"},
                                   { tag: "Basic", content: "Degree"},
                                   { tag: "Basic", content: "Degree"},
                               ] },
                    name: "Positive degree 4",
                    description: "Positive influence on the FOURTH derivative 🤯🤯",
                    arrowStyle: "plusDeg",
                    preferUnnamed: true,
                },
                // {
                //     tag: "MorType",
                //     morType: { tag: "Basic", content: "Delay" },
                //     name: "Positive degree 0 with delay",
                //     description: "Delayed positive influence",
                //     arrowStyle: "plusDelay",
                //     preferUnnamed: true,
                // },
                // {
                //     tag: "MorType",
                //     morType: { tag: "Composite", content:
                //                [
                //                    { tag: "Basic", content: "Negative"},
                //                    { tag: "Basic", content: "Delay"},
                //                ] },
                //     name: "Negative degree 0 with delay",
                //     description: "Delayed negative influence",
                //     arrowStyle: "minusDelay",
                //     preferUnnamed: true,
                // },
                // {
                //     tag: "MorType",
                //     morType: { tag: "Composite", content:
                //                [
                //                    { tag: "Basic", content: "Degree"},
                //                    { tag: "Basic", content: "Delay"},
                //                ] },
                //     name: "Positive degree 1 with delay",
                //     description: "Delayed positive influence on the derivative",
                //     arrowStyle: "plusDegDelay",
                //     preferUnnamed: true,
                // },
                // {
                //     tag: "MorType",
                //     morType: { tag: "Composite", content:
                //                [
                //                    { tag: "Basic", content: "Negative"},
                //                    { tag: "Basic", content: "Degree"},
                //                    { tag: "Basic", content: "Delay"},
                //                ] },
                //     name: "Negative degree 1 with delay",
                //     description: "Delayed negative influence on the derivative",
                //     arrowStyle: "minusDegDelay",
                //     preferUnnamed: true,
                // },
            ],
            modelAnalyses: [
                analyses.configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the extended causal loop diagram",
                }),
                analyses.configureCCL({
                    simulate: (model, data) => thNN2Category.ccl(model, data),
                }),
            ],
        });
    },
);

stdTheories.add(
    {
        id: "causal-loop-delays",
        name: "Causal loop diagram with delays",
        description: "Causal relationships: positive or negative, fast or slow",
        group: "System Dynamics",
        help: "causal-loop-delays",
    },
    (meta) => {
        const thDelayedSignedCategory = new catlog.ThDelayableSignedCategory();

        return new Theory({
            ...meta,
            theory: thDelayedSignedCategory.theory(),
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
                    description: "Fast-acting positive influence",
                    arrowStyle: "plus",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "Negative" },
                    name: "Negative link",
                    shortcut: ["N"],
                    description: "Fast-acting negative influence",
                    arrowStyle: "minus",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "PositiveSlow" },
                    name: "Delayed positive link",
                    description: "Slow-acting positive influence",
                    arrowStyle: "plusCaesura",
                    preferUnnamed: true,
                },
                {
                    tag: "MorType",
                    morType: { tag: "Basic", content: "NegativeSlow" },
                    name: "Delayed negative link",
                    description: "Slow-acting negative influence",
                    arrowStyle: "minusCaesura",
                    preferUnnamed: true,
                },
            ],
            modelAnalyses: [
                analyses.configureModelGraph({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the causal loop diagram",
                }),
                analyses.configureSubmodelsAnalysis({
                    id: "negative-loops",
                    name: "Balancing loops",
                    description: "Find the fast-acting balancing loops",
                    findSubmodels(model, options) {
                        return thDelayedSignedCategory.negativeLoops(model, options);
                    },
                }),
                analyses.configureSubmodelsAnalysis({
                    id: "positive-loops",
                    name: "Reinforcing loops",
                    description: "Find the fast-acting reinforcing loops",
                    findSubmodels(model, options) {
                        return thDelayedSignedCategory.positiveLoops(model, options);
                    },
                }),
                analyses.configureSubmodelsAnalysis({
                    id: "delayed-negative-loops",
                    name: "Delayed balancing loops",
                    description: "Find the slow-acting balancing loops",
                    findSubmodels(model, options) {
                        return thDelayedSignedCategory.delayedNegativeLoops(model, options);
                    },
                }),
                analyses.configureSubmodelsAnalysis({
                    id: "delayed-positive-loops",
                    name: "Delayed reinforcing loops",
                    description: "Find the slow-acting reinforcing loops",
                    findSubmodels(model, options) {
                        return thDelayedSignedCategory.delayedPositiveLoops(model, options);
                    },
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
        help: "indeterminate-causal-loop",
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
                analyses.configureModelGraph({
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
        help: "unary-dec",
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
                analyses.configureModelGraph({
                    id: "graph",
                    name: "Visualization",
                    description: "Visualize the operations as a graph",
                }),
            ],
            diagramAnalyses: [
                analyses.configureDiagramGraph({
                    id: "graph",
                    name: "Visualization",
                    description: "Visualize the equations as a diagram",
                }),
                analyses.configureDecapodes({}),
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
        help: "stock-flow",
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
                analyses.configureStockFlowDiagram({
                    id: "diagram",
                    name: "Visualization",
                    description: "Visualize the stock and flow diagram",
                }),
                analyses.configureMassAction({
                    simulate(model, data) {
                        return thCategoryLinks.massAction(model, data);
                    },
                    isTransition(mor) {
                        return mor.morType.tag === "Hom";
                    },
                }),
            ],
        });
    },
);
