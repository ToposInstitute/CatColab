import { TheoryLibrary } from "./types";

/** Standard library of double theories supported by the frontend. */
export const stdTheories = new TheoryLibrary();

stdTheories.add(
    {
        id: "empty",
        name: "Informal",
        description: "The empty logic, allowing only informal content",
        isDefault: true,
        group: "Base",
        help: true,
    },
    () => import("./theories/empty"),
);

stdTheories.add(
    {
        id: "simple-olog",
        name: "Olog",
        description: "Ontology log, a simple conceptual model",
        group: "Knowledge and Data",
        help: true,
    },
    () => import("./theories/simple-olog"),
);

stdTheories.add(
    {
        id: "simple-schema",
        name: "Schema",
        description: "Schema for a categorical database",
        group: "Knowledge and Data",
        help: true,
    },
    () => import("./theories/simple-schema"),
);

stdTheories.add(
    {
        id: "petri-net",
        name: "Petri net",
        description: "Place/transition networks",
        group: "Systems",
        help: true,
    },
    () => import("./theories/petri-net"),
);

stdTheories.add(
    {
        id: "causal-loop",
        name: "Causal loop diagram",
        description: "Positive and negative causal relationships",
        group: "System Dynamics",
        help: true,
    },
    () => import("./theories/causal-loop"),
);

stdTheories.add(
    {
        id: "causal-loop-delays",
        name: "Causal loop diagram with delays",
        description: "Causal relationships: positive or negative, fast or slow",
        group: "System Dynamics",
        help: true,
    },
    () => import("./theories/causal-loop-delays"),
);

stdTheories.add(
    {
        id: "indeterminate-causal-loop",
        name: "Causal loop diagram with indeterminates",
        description: "Positive, negative, and indeterminate causal relationships",
        group: "System Dynamics",
        help: true,
    },
    () => import("./theories/indeterminate-causal-loop"),
);

stdTheories.add(
    {
        id: "primitive-stock-flow",
        name: "Stock and flow",
        description: "Model accumulation (stocks) and change (flows)",
        group: "System Dynamics",
        help: true,
    },
    () => import("./theories/primitive-stock-flow"),
);

stdTheories.add(
    {
        id: "reg-net",
        name: "Regulatory network",
        description: "Biochemical species that promote or inhibit each other",
        group: "Biology",
        help: true,
    },
    () => import("./theories/reg-net"),
);

stdTheories.add(
    {
        id: "unary-dec",
        name: "Discrete exterior calculus (DEC)",
        description: "DEC operators on a geometrical space",
        group: "Applied Mathematics",
        help: true,
    },
    () => import("./theories/unary-dec"),
);
